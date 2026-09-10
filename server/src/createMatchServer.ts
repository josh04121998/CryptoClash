import { randomUUID } from "node:crypto";
import { createServer, Server as HttpServer } from "node:http";
import { DEFAULT_DECK_ID, getDeck, PlayerId, validateDeck } from "@cryptoclash/engine";
import { ClientMessage, ServerMessage } from "@cryptoclash/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { pruneExpiredNonces, verifySessionToken } from "./auth.js";
import { getPool } from "./db.js";
import { handleApiRequest } from "./httpApi.js";
import { MatchRoom, MatchRoomOptions } from "./matchRoom.js";
import { Session } from "./types.js";

export interface MatchServerHandle {
  httpServer: HttpServer;
  port: number;
  close: () => Promise<void>;
}

export interface MatchServerOptions {
  /** Overrides MatchRoom's disconnect-grace/forfeit timeout — production leaves this unset (RECONNECT_GRACE_MS). Only meant for tests that need a short grace period to exercise the forfeit path quickly. */
  graceMs?: number;
}

/** Boots the HTTP + WebSocket match server. Exported as a factory (rather than run-on-import) so tests can start/stop isolated instances on ephemeral ports. */
export function createMatchServer(port = 0, options: MatchServerOptions = {}): Promise<MatchServerHandle> {
  const queue: Session[] = [];

  // Held-room registries, so a fresh socket presenting a `reconnect` can find its way back to
  // the still-live MatchRoom it dropped from. Two lookup paths (see shared/src/index.ts's
  // `reconnect` message docs): the reconnectToken every match seat gets on matchFound (works for
  // anonymous play too, since there's no other persistent identity there), and a wallet-linked
  // accountId as a fallback for authenticated players who lost the token client-side. Entries are
  // removed via each MatchRoom's onEnded callback once it fully tears down, so these stay bounded.
  const reconnectIndex = new Map<string, { room: MatchRoom; playerId: PlayerId }>();
  const accountRoomIndex = new Map<string, { room: MatchRoom; playerId: PlayerId }>();

  function registerRoom(room: MatchRoom) {
    for (const playerId of ["A", "B"] as PlayerId[]) {
      reconnectIndex.set(room.reconnectTokenFor(playerId), { room, playerId });
      const accountId = room.accountIdFor(playerId);
      if (accountId) accountRoomIndex.set(accountId, { room, playerId });
    }
  }

  function unregisterRoom(room: MatchRoom) {
    for (const playerId of ["A", "B"] as PlayerId[]) {
      const token = room.reconnectTokenFor(playerId);
      if (reconnectIndex.get(token)?.room === room) reconnectIndex.delete(token);
      const accountId = room.accountIdFor(playerId);
      if (accountId && accountRoomIndex.get(accountId)?.room === room) accountRoomIndex.delete(accountId);
    }
  }

  const matchRoomOptions: Pick<MatchRoomOptions, "graceMs" | "onEnded"> = { graceMs: options.graceMs, onEnded: unregisterRoom };

  const httpServer = createServer((req, res) => {
    if ((req.url ?? "/").startsWith("/api/")) {
      let pool;
      try {
        pool = getPool();
      } catch {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Accounts/decks API is not configured (DATABASE_URL unset)." }));
        return;
      }
      handleApiRequest(req, res, pool).catch((e) => {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("CRYPTO CLASH match server\n");
  });

  const wss = new WebSocketServer({ server: httpServer });

  /**
   * `intentional`: true for an explicit `leave` message (ends the match for
   * the opponent right away), false for the socket simply closing (starts the
   * reconnect grace period instead — see MatchRoom.handleDisconnect).
   */
  function cleanupSession(session: Session, intentional: boolean) {
    const idx = queue.indexOf(session);
    if (idx !== -1) queue.splice(idx, 1);
    if (session.room) {
      if (intentional) session.room.handleLeave(session.id);
      else session.room.handleDisconnect(session.id);
      session.room = null;
    }
  }

  /** Never throws — a bad/missing/expired token just means anonymous play, exactly as if none was sent. */
  async function resolveAccountId(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    const claims = await verifySessionToken(token);
    return claims?.accountId ?? null;
  }

  wss.on("connection", (socket: WebSocket) => {
    const session: Session = { id: randomUUID(), socket, room: null, cards: getDeck(DEFAULT_DECK_ID), accountId: null };

    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (message.type) {
        case "findMatch": {
          if (session.room) return;
          // Client-supplied deck (starter or a saved custom deck) — re-validated here since
          // the server can't trust anything a client claims about its own deck's legality.
          session.cards = message.cards && validateDeck(message.cards).length === 0 ? message.cards : getDeck(DEFAULT_DECK_ID);
          resolveAccountId(message.token).then((accountId) => {
            session.accountId = accountId;
            // Left, matched, or disconnected already while the token was resolving.
            if (session.room || socket.readyState !== WebSocket.OPEN) return;
            const opponent = queue.shift();
            if (opponent) {
              const room = new MatchRoom(opponent, session, matchRoomOptions);
              opponent.room = room;
              session.room = room;
              registerRoom(room);
              room.start();
            } else {
              queue.push(session);
              socket.send(JSON.stringify({ type: "queued" } satisfies ServerMessage));
            }
          });
          return;
        }
        case "intent":
          session.room?.handleIntent(session.id, message.intent);
          return;
        case "leave":
          cleanupSession(session, true);
          return;
        case "reconnect": {
          resolveAccountId(message.token).then((accountId) => {
            if (socket.readyState !== WebSocket.OPEN) return;
            let match = message.reconnectToken ? reconnectIndex.get(message.reconnectToken) : undefined;
            if (!match && accountId) match = accountRoomIndex.get(accountId);
            if (!match) {
              socket.send(JSON.stringify({ type: "reconnectFailed" } satisfies ServerMessage));
              return;
            }
            const { room, playerId } = match;
            // Always the seat's canonical accountId, not whatever the presented token resolved
            // to — a reconnectToken alone is proof enough of "same seat," and rewards/quest
            // tracking must stay attributed to whoever actually started the match in that seat.
            session.accountId = room.accountIdFor(playerId);
            session.room = room;
            const state = room.reconnect(playerId, session);
            if (!state) {
              session.room = null;
              socket.send(JSON.stringify({ type: "reconnectFailed" } satisfies ServerMessage));
              return;
            }
            socket.send(JSON.stringify({ type: "reconnected", playerId, state } satisfies ServerMessage));
          });
          return;
        }
      }
    });

    socket.on("close", () => cleanupSession(session, false));
  });

  // Sweeps auth.ts's pendingNonces map every minute so abandoned sign-in attempts (nonce issued,
  // never consumed) can't grow it unbounded — nonces themselves expire after NONCE_TTL_MS (5 min),
  // this just reclaims the memory. `unref()` so this timer alone never keeps the process alive;
  // cleared in `close()` below so tests that start/stop the server repeatedly don't leak intervals.
  const noncePruneInterval = setInterval(pruneExpiredNonces, 60_000);
  noncePruneInterval.unref();

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolve({
        httpServer,
        port: boundPort,
        close: () =>
          new Promise((res, rej) => {
            clearInterval(noncePruneInterval);
            wss.close();
            httpServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
