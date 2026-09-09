import { randomUUID } from "node:crypto";
import { Intent, MatchState, PlayerId, applyIntent, createMatch } from "@cryptoclash/engine";
import { NetworkMatchState, ServerMessage, serializeState } from "@cryptoclash/protocol";
import { awardMatchResult, MatchOutcome } from "./coinsRepo.js";
import { getPool } from "./db.js";
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
  private readonly graceMs: number;
  private readonly onEndedCallback?: (room: MatchRoom) => void;
  private disconnectTimers: Partial<Record<PlayerId, ReturnType<typeof setTimeout>>> = {};
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;
  /** Rewards already resolved for a player who was disconnected when they fired — resent on reconnect so a late rejoin doesn't miss the banner. */
  private lastReward: Partial<Record<PlayerId, { coinsEarned: number; balance: number }>> = {};

  constructor(sessionA: Session, sessionB: Session, options: MatchRoomOptions = {}) {
    this.sessions = { A: sessionA, B: sessionB };
    this.state = createMatch(sessionA.cards, sessionB.cards, options.seed ?? Date.now() ^ Math.floor(Math.random() * 1e9));
    this.reconnectTokens = { A: randomUUID(), B: randomUUID() };
    // Captured once, at seat assignment — stays the "owner of this seat" for reconnect-matching
    // purposes even if a later reconnect attempt's token resolves to a different account.
    this.seatAccountIds = { A: sessionA.accountId, B: sessionB.accountId };
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
    const state = serializeState(this.state);
    this.send("A", { type: "matchFound", playerId: "A", state, reconnectToken: this.reconnectTokens.A });
    this.send("B", { type: "matchFound", playerId: "B", state, reconnectToken: this.reconnectTokens.B });
  }

  private broadcastState() {
    const state = serializeState(this.state);
    this.send("A", { type: "state", state });
    this.send("B", { type: "state", state });
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
    this.scheduleTeardown(POST_MATCH_HOLD_MS);
  }

  /**
   * Play Online only — Play vs AI runs entirely client-side with no server
   * validation of the outcome, so it never reaches this class at all. Silently
   * no-ops (no crash, no matchReward sent) whenever Coins can't be awarded:
   * DATABASE_URL unconfigured, or a session with no wallet-linked account.
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
      awardMatchResult(pool, accountId, outcome)
        .then(({ amount, balance }) => {
          this.lastReward[playerId] = { coinsEarned: amount, balance };
          this.send(playerId, { type: "matchReward", coinsEarned: amount, balance });
        })
        .catch(() => {
          // Best-effort — a Coins award failure shouldn't crash the match or the process.
        });
      // Best-effort, same reasoning as the Coins award above — a quest-tracking failure
      // shouldn't crash the match. "play" always advances; "win" only for the actual winner.
      recordQuestProgress(pool, accountId, "play").catch(() => {});
      if (outcome === "win") recordQuestProgress(pool, accountId, "win").catch(() => {});
      // Best-effort, same reasoning — pays out a referrer's free pack the first time their
      // referred friend (this account) finishes a real match. A silent no-op for everyone else.
      rewardReferrerIfPending(pool, accountId).catch(() => {});
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
    this.disconnectTimers[playerId] = setTimeout(() => this.forfeit(playerId), this.graceMs);
  }

  /** An intentional "Leave" click (the `leave` message) — ends the match for the opponent immediately, no grace period. */
  handleLeave(sessionId: string) {
    const playerId = this.playerIdFor(sessionId);
    if (!playerId || this.ended) return;
    this.clearDisconnectTimer(playerId);
    if (this.state.winner === null) {
      this.forfeit(playerId);
    } else {
      // Already concluded (this is a post-match "Leave"/exit) — just let the room tear down.
      this.scheduleTeardown(0);
    }
  }

  private forfeit(playerId: PlayerId) {
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
    this.scheduleTeardown(POST_MATCH_HOLD_MS);
  }

  /**
   * Same-seat reconnection: swaps in the new socket/session, cancels any
   * pending forfeit for that seat, and hands back the authoritative state to
   * resume from (plus any reward the disconnected player missed). Returns
   * null if this room is no longer reconnectable (already fully torn down).
   */
  reconnect(playerId: PlayerId, newSession: Session): NetworkMatchState | null {
    if (this.ended) return null;
    this.clearDisconnectTimer(playerId);
    this.sessions[playerId] = newSession;
    newSession.room = this;
    this.send(other(playerId), { type: "opponentReconnected" });
    const reward = this.lastReward[playerId];
    if (reward) this.send(playerId, { type: "matchReward", ...reward });
    return serializeState(this.state);
  }

  private scheduleTeardown(delayMs: number) {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      this.ended = true;
      this.onEndedCallback?.(this);
    }, delayMs);
  }
}
