import { Intent, MatchState, PlayerId, applyIntent, createMatch } from "@cryptoclash/engine";
import { ServerMessage, serializeState } from "@cryptoclash/protocol";
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
    const state = serializeState(this.state);
    this.send("A", { type: "matchFound", playerId: "A", state });
    this.send("B", { type: "matchFound", playerId: "B", state });
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

  handleIntent(sessionId: string, intent: Intent) {
    const playerId = this.playerIdFor(sessionId);
    if (!playerId) return;
    if (intent.playerId !== playerId) {
      this.send(playerId, { type: "error", message: "You can only submit intents for your own player." });
      return;
    }
    try {
      applyIntent(this.state, intent);
      this.broadcastState();
    } catch (e) {
      this.send(playerId, { type: "error", message: (e as Error).message });
    }
  }

  handleDisconnect(sessionId: string) {
    const otherPlayerId = this.playerIdFor(sessionId) === "A" ? "B" : "A";
    this.send(otherPlayerId, { type: "opponentLeft" });
  }
}
