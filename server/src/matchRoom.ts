import { randomUUID } from "node:crypto";
import { Intent, MatchState, PlayerId, applyIntent, createMatch } from "@cryptoclash/engine";
import { NetworkMatchState, ServerMessage, serializeState } from "@cryptoclash/protocol";
import { recordMatchOutcomeForAchievements } from "./achievementsRepo.js";
import { awardMatchResult, MatchOutcome } from "./coinsRepo.js";
import { getPool } from "./db.js";
import { deckFaction, MatchEndReason, recordMatch } from "./matchesRepo.js";
import { awardRankPoints } from "./rankRepo.js";
import { recordQuestProgress } from "./questsRepo.js";
import { rewardReferrerIfPending } from "./referralsRepo.js";
import { RoomHandle, Session } from "./types.js";

/**
 * How long a dropped connection's seat is held open for reconnection before
 * the match is forfeited to the remaining player. 45s is a middle-of-the-road
 * pick for "long enough to survive a phone lock/tab-backgrounding/brief wifi
 * blip, short enough that the opponent isn't left waiting forever."
 */
export const RECONNECT_GRACE_MS = 45_000;

/**
 * How long after a match concludes (naturally, or by forfeit) a still-held
 * room keeps accepting a reconnect from whoever was disconnected at the time
 * — long enough for them to reconnect and see the real final state/result
 * overlay/matchReward instead of just landing on a dead "opponent left" screen.
 */
export const POST_MATCH_HOLD_MS = 30_000;

export interface MatchRoomOptions {
  seed?: number;
  /** Overridable for tests — production always uses RECONNECT_GRACE_MS. */
  graceMs?: number;
  /** Invoked exactly once, when this room should be forgotten (its reconnect-token/account mapping released) — keeps createMatchServer's registries bounded. */
  onEnded?: (room: MatchRoom) => void;
}

function other(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

/**
 * One live match: owns the authoritative MatchState and the two sockets
 * watching it. A socket dropping unexpectedly doesn't end the match — the
 * seat is held open for a grace period during which the same player (proven
 * by a per-seat reconnect token, or a matching wallet-linked accountId — see
 * createMatchServer.ts) can reconnect and resume exactly where they left off.
 * If the grace period lapses with no reconnect, the match is forfeited to the
 * remaining player rather than left hanging forever.
 */
export class MatchRoom implements RoomHandle {
  private state: MatchState;
  private sessions: Record<PlayerId, Session>;
  private readonly reconnectTokens: Record<PlayerId, string>;
  private readonly seatAccountIds: Record<PlayerId, string | null>;
  /**
   * The 30 card ids each seat actually started the match with. Captured here
   * rather than read off `this.sessions[p].cards` at the end, because a
   * reconnect swaps in a brand-new Session whose `cards` is still the default
   * deck it was constructed with (see createMatchServer.ts) — reading it later
   * would mis-record the faction of anyone who reconnected mid-match.
   */
  private readonly seatCards: Record<PlayerId, string[]>;
  /** Wall clock at room creation (both seats filled) — the start of `matches.duration_ms`. */
  private readonly startedAt = Date.now();
  private readonly graceMs: number;
  private readonly onEndedCallback?: (room: MatchRoom) => void;
  private disconnectTimers: Partial<Record<PlayerId, ReturnType<typeof setTimeout>>> = {};
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;
  /**
   * Guards the one-row-per-match telemetry insert (matchesRepo.ts has no
   * idempotency of its own). Both existing end paths are already guarded
   * against re-entry — `conclude()` only fires on the undecided->decided
   * transition, and `forfeit()` returns early once `state.winner` is set — so
   * this is belt-and-braces rather than the sole guard, but it makes
   * "recorded exactly once" a property of this flag alone instead of an
   * emergent property of two other conditions in two other methods.
   */
  private recorded = false;

  constructor(sessionA: Session, sessionB: Session, options: MatchRoomOptions = {}) {
    this.sessions = { A: sessionA, B: sessionB };
    this.state = createMatch(sessionA.cards, sessionB.cards, options.seed ?? Date.now() ^ Math.floor(Math.random() * 1e9));
    this.reconnectTokens = { A: randomUUID(), B: randomUUID() };
    // Captured once, at seat assignment — stays the "owner of this seat" for reconnect-matching
    // purposes even if a later reconnect attempt's token resolves to a different account.
    this.seatAccountIds = { A: sessionA.accountId, B: sessionB.accountId };
    this.seatCards = { A: sessionA.cards, B: sessionB.cards };
    this.graceMs = options.graceMs ?? RECONNECT_GRACE_MS;
    this.onEndedCallback = options.onEnded;
  }

  reconnectTokenFor(playerId: PlayerId): string {
    return this.reconnectTokens[playerId];
  }

  accountIdFor(playerId: PlayerId): string | null {
    return this.seatAccountIds[playerId];
  }

  private send(playerId: PlayerId, message: ServerMessage) {
    const socket = this.sessions[playerId].socket;
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  start() {
    // Per-viewer redaction (shared/src/index.ts) means A and B no longer get
    // an identical payload — each has to be serialized from its own vantage
    // point so the *other* player's hand/deck/secrets come across hidden.
    this.send("A", { type: "matchFound", playerId: "A", state: serializeState(this.state, "A"), reconnectToken: this.reconnectTokens.A });
    this.send("B", { type: "matchFound", playerId: "B", state: serializeState(this.state, "B"), reconnectToken: this.reconnectTokens.B });
  }

  private broadcastState() {
    this.send("A", { type: "state", state: serializeState(this.state, "A") });
    this.send("B", { type: "state", state: serializeState(this.state, "B") });
  }

  private playerIdFor(sessionId: string): PlayerId | null {
    if (this.sessions.A.id === sessionId) return "A";
    if (this.sessions.B.id === sessionId) return "B";
    return null;
  }

  private clearDisconnectTimer(playerId: PlayerId) {
    const timer = this.disconnectTimers[playerId];
    if (timer) {
      clearTimeout(timer);
      delete this.disconnectTimers[playerId];
    }
  }

  handleIntent(sessionId: string, intent: Intent) {
    const playerId = this.playerIdFor(sessionId);
    if (!playerId) return;
    if (intent.playerId !== playerId) {
      this.send(playerId, { type: "error", message: "You can only submit intents for your own player." });
      return;
    }
    const wasDecided = this.state.winner !== null;
    try {
      applyIntent(this.state, intent);
      this.broadcastState();
      // Award exactly once, at the instant the match transitions from undecided to decided.
      if (!wasDecided && this.state.winner !== null) this.conclude(this.state.winner);
    } catch (e) {
      this.send(playerId, { type: "error", message: (e as Error).message });
    }
  }

  /** A real, engine-decided conclusion (as opposed to a forfeit) — e.g. the opponent kept playing solo and won outright while the other seat's disconnect grace timer was still running. */
  private conclude(winner: PlayerId | "Draw") {
    (["A", "B"] as PlayerId[]).forEach((p) => this.clearDisconnectTimer(p));
    this.awardMatchRewards(winner);
    this.recordMatchOutcome(winner, "conclusion");
    this.scheduleTeardown(POST_MATCH_HOLD_MS);
  }

  /**
   * Play Online only — Play vs AI runs entirely client-side with no server
   * validation of the outcome, so it never reaches this class at all. Silently
   * no-ops whenever nothing can be recorded: DATABASE_URL unconfigured, or a
   * session with no wallet-linked account.
   *
   * No Coins are credited here (session 20 — see coinsRepo.ts's
   * `awardMatchResult` doc comment for why the flat per-match payout was
   * removed) and no `matchReward` WS message is sent; `awardMatchResult`
   * still logs a zero-amount audit row purely so leaderboardRepo.ts's
   * win/loss aggregates keep working.
   */
  private awardMatchRewards(winner: PlayerId | "Draw") {
    let pool;
    try {
      pool = getPool();
    } catch {
      return;
    }
    for (const playerId of ["A", "B"] as PlayerId[]) {
      const accountId = this.sessions[playerId].accountId;
      if (!accountId) continue;
      const outcome: MatchOutcome = winner === "Draw" ? "draw" : winner === playerId ? "win" : "loss";
      // Best-effort throughout — a tracking failure on any one of these shouldn't crash the match.
      awardMatchResult(pool, accountId, outcome).catch(() => {});
      // "play" always advances; "win" only for the actual winner. This is the game's real
      // Coins-from-matches path now (spec.md Section 21) — capped per day by the quest goal
      // itself, unlike the flat reward this replaced.
      recordQuestProgress(pool, accountId, "play").catch(() => {});
      if (outcome === "win") recordQuestProgress(pool, accountId, "win").catch(() => {});
      // Pays out a referrer's free pack the first time their referred friend (this account)
      // finishes a real match. A silent no-op for everyone else.
      rewardReferrerIfPending(pool, accountId).catch(() => {});
      // Advances "win_total"/"win_streak" achievements and the ranked ladder
      // (achievementsRepo.ts, rankRepo.ts), both keyed off this exact server-validated result.
      recordMatchOutcomeForAchievements(pool, accountId, outcome).catch(() => {});
      awardRankPoints(pool, accountId, outcome).catch(() => {});
    }
  }

  /**
   * An unexpected socket close (see createMatchServer.ts's socket "close"
   * handler). Doesn't end the match — notifies the opponent and starts the
   * reconnect grace timer, forfeiting to them only if it lapses unreconnected.
   */
  handleDisconnect(sessionId: string) {
    const playerId = this.playerIdFor(sessionId);
    if (!playerId || this.ended) return;
    if (this.state.winner !== null) return; // already decided — nothing to hold open for
    this.clearDisconnectTimer(playerId);
    this.send(other(playerId), { type: "opponentDisconnected", graceMs: this.graceMs });
    // "abandon", not "forfeit": nobody chose to end this match, a connection died and nobody
    // came back. The two are recorded distinguishably because one is a game-design signal and
    // the other an infrastructure one — see matchesRepo.ts's MatchEndReason.
    this.disconnectTimers[playerId] = setTimeout(() => this.forfeit(playerId, "abandon"), this.graceMs);
  }

  /** An intentional "Leave" click (the `leave` message) — ends the match for the opponent immediately, no grace period. */
  handleLeave(sessionId: string) {
    const playerId = this.playerIdFor(sessionId);
    if (!playerId || this.ended) return;
    this.clearDisconnectTimer(playerId);
    if (this.state.winner === null) {
      this.forfeit(playerId, "forfeit");
    } else {
      // Already concluded (this is a post-match "Leave"/exit) — just let the room tear down.
      this.scheduleTeardown(0);
    }
  }

  /**
   * `reason` distinguishes the two ways a seat can stop playing: "forfeit" (an
   * intentional Leave click, via handleLeave) and "abandon" (a dropped socket
   * whose reconnect grace period lapsed, via handleDisconnect's timer). Both
   * produce an identical *game* outcome — a real decided winner — and are
   * deliberately indistinguishable to the remaining player; they are only
   * told apart in the recorded match row.
   */
  private forfeit(playerId: PlayerId, reason: Extract<MatchEndReason, "forfeit" | "abandon">) {
    if (this.ended || this.state.winner !== null) return; // a real win may have landed first — see conclude()
    this.clearDisconnectTimer(playerId);
    this.clearDisconnectTimer(other(playerId));
    const winner = other(playerId);
    this.state.winner = winner;
    // A forfeit now behaves exactly like a real engine-decided win from the remaining player's
    // point of view: the normal `state` broadcast (winner set) is enough for the client's
    // existing win/lose result overlay to fire — no separate opponentLeft/"dead screen" needed,
    // since there's always a real decided winner to show by the time a forfeit happens.
    this.broadcastState();
    this.awardMatchRewards(winner);
    this.recordMatchOutcome(winner, reason);
    this.scheduleTeardown(POST_MATCH_HOLD_MS);
  }

  /**
   * Writes the one durable `matches` row for this match (matchesRepo.ts /
   * 0014_matches.sql) — the record game balance is tuned against, and the only
   * place a match's turn count, duration, per-seat faction and *how it ended*
   * survive at all.
   *
   * Called from exactly the three paths a match can end on, all of which
   * funnel through conclude() or forfeit():
   *   conclude()        -> "conclusion"  (engine-decided: HP to 0, fatigue, draw)
   *   handleLeave()     -> "forfeit"     (intentional Leave, no grace period)
   *   handleDisconnect()-> "abandon"     (grace period lapsed, no reconnect)
   * A match that simply never ends (both sides gone, process restarted) is
   * never recorded — an accepted gap, not a silent partial row.
   *
   * Best-effort in exactly the same way as awardMatchRewards above: a missing
   * DATABASE_URL or a failing insert is swallowed. This must never crash a
   * match or change its outcome. Unlike the reward calls, it records anonymous
   * matches too — an anonymous seat is a null account_id, not a skipped row;
   * dropping those would bias every balance number towards wallet-linked
   * players, who are not a random sample of the playerbase.
   */
  private recordMatchOutcome(winner: PlayerId | "Draw", endReason: MatchEndReason) {
    if (this.recorded) return;
    this.recorded = true;
    let pool;
    try {
      pool = getPool();
    } catch {
      return;
    }
    // Snapshotted synchronously, before the await — the state keeps no history and the
    // post-match hold window (POST_MATCH_HOLD_MS) is still live at this point.
    const seats = { A: this.seatRecord("A"), B: this.seatRecord("B") };
    recordMatch(pool, {
      winner,
      endReason,
      turns: this.state.turnNumber,
      durationMs: Date.now() - this.startedAt,
      startedAt: new Date(this.startedAt),
      seats,
    }).catch(() => {});
  }

  private seatRecord(playerId: PlayerId) {
    const { faction, cardCount } = deckFaction(this.seatCards[playerId]);
    return {
      // The seat's canonical account (captured at seat assignment), not the current session's
      // — same reasoning as createMatchServer.ts's reconnect handler: a reconnect must not
      // re-attribute a match to whoever's token happened to be presented.
      accountId: this.seatAccountIds[playerId],
      faction,
      factionCards: cardCount,
      hp: this.state.players[playerId].hp,
    };
  }

  /**
   * Same-seat reconnection: swaps in the new socket/session, cancels any
   * pending forfeit for that seat, and hands back the authoritative state to
   * resume from. Returns null if this room is no longer reconnectable
   * (already fully torn down).
   */
  reconnect(playerId: PlayerId, newSession: Session): NetworkMatchState | null {
    if (this.ended) return null;
    this.clearDisconnectTimer(playerId);
    this.sessions[playerId] = newSession;
    newSession.room = this;
    this.send(other(playerId), { type: "opponentReconnected" });
    return serializeState(this.state, playerId);
  }

  private scheduleTeardown(delayMs: number) {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      this.ended = true;
      this.onEndedCallback?.(this);
    }, delayMs);
  }
}
