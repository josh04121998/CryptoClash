import { Intent } from "@cryptoclash/engine";
import { WebSocket } from "ws";

export interface Session {
  id: string;
  socket: WebSocket;
  room: RoomHandle | null;
  /** Resolved 30-card deck from the findMatch message; set once, used when a room is created. */
  cards: string[];
}

/**
 * Narrow interface so Session doesn't need to import the MatchRoom class
 * directly — avoids a circular module dependency between types.ts and
 * matchRoom.ts (MatchRoom needs Session; Session only needs this much of it).
 */
export interface RoomHandle {
  handleIntent(sessionId: string, intent: Intent): void;
  handleDisconnect(sessionId: string): void;
}
