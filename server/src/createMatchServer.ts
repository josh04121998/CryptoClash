import { randomUUID } from "node:crypto";
import { createServer, Server as HttpServer } from "node:http";
import { DEFAULT_DECK_ID, getDeck, validateDeck } from "@cryptoclash/engine";
import { ClientMessage } from "@cryptoclash/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { verifySessionToken } from "./auth.js";
import { getPool } from "./db.js";
import { handleApiRequest } from "./httpApi.js";
import { MatchRoom } from "./matchRoom.js";
import { Session } from "./types.js";

export interface MatchServerHandle {
  httpServer: HttpServer;
  port: number;
  close: () => Promise<void>;
}

/** Boots the HTTP + WebSocket match server. Exported as a factory (rather than run-on-import) so tests can start/stop isolated instances on ephemeral ports. */
export function createMatchServer(port = 0): Promise<MatchServerHandle> {
  const queue: Session[] = [];

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

  function cleanupSession(session: Session) {
    const idx = queue.indexOf(session);
    if (idx !== -1) queue.splice(idx, 1);
    if (session.room) {
      session.room.handleDisconnect(session.id);
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
              const room = new MatchRoom(opponent, session);
              opponent.room = room;
              session.room = room;
              room.start();
            } else {
              queue.push(session);
              socket.send(JSON.stringify({ type: "queued" }));
            }
          });
          return;
        }
        case "intent":
          session.room?.handleIntent(session.id, message.intent);
          return;
        case "leave":
          cleanupSession(session);
          return;
      }
    });

    socket.on("close", () => cleanupSession(session));
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolve({
        httpServer,
        port: boundPort,
        close: () =>
          new Promise((res, rej) => {
            wss.close();
            httpServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
