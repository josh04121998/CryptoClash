import { randomUUID } from "node:crypto";
import { createServer, Server as HttpServer } from "node:http";
import { ClientMessage } from "@cryptoclash/protocol";
import { WebSocket, WebSocketServer } from "ws";
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

  const httpServer = createServer((_req, res) => {
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

  wss.on("connection", (socket: WebSocket) => {
    const session: Session = { id: randomUUID(), socket, room: null };

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
