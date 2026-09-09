import { Intent, MatchState, PlayerId, applyIntent, createMatch } from "@cryptoclash/engine";
import { ServerMessage, serializeState } from "@cryptoclash/protocol";
import { awardMatchResult, MatchOutcome } from "./coinsRepo.js";
import { getPool } from "./db.js";
import { recordQuestProgress } from "./questsRepo.js";
import { rewardReferrerIfPending } from "./referralsRepo.js";
import { RoomHandle, Session } from "./types.js";

/** One live match: owns the authoritative MatchState and the two sockets watching it. */
export class MatchRoom implements RoomHandle {
  private state: MatchState;
  private sessions: Record<PlayerId, Session>;

  constructor(sessionA: Session, sessionB: Session, seed = Date.now() ^ Math.floor(Math.random() * 1e9)) {
    this.sessions = { A: sessionA, B: sessionB };
    this.state = createMatch(sessionA.cards, sessionB.cards, seed);
  }

  private send(playerId: PlayerId, message: ServerMessage) {
    const socket = this.sessions[playerId].socket;
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  start() {
    // Per-viewer redaction (shared/src/index.ts) means A and B no longer get
    // an identical payload — each has to be serialized from its own vantage
    // point so the *other* player's hand/deck/secrets come across hidden.
    this.send("A", { type: "matchFound", playerId: "A", state: serializeState(this.state, "A") });
    this.send("B", { type: "matchFound", playerId: "B", state: serializeState(this.state, "B") });
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
      if (!wasDecided && this.state.winner !== null) this.awardMatchRewards(this.state.winner);
    } catch (e) {
      this.send(playerId, { type: "error", message: (e as Error).message });
    }
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

  handleDisconnect(sessionId: string) {
    const otherPlayerId = this.playerIdFor(sessionId) === "A" ? "B" : "A";
    this.send(otherPlayerId, { type: "opponentLeft" });
  }
}
