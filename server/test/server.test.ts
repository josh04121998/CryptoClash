import { ClientMessage, ServerMessage } from "@cryptoclash/protocol";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMatchServer, MatchServerHandle } from "../src/createMatchServer.js";

let server: MatchServerHandle;
let url: string;

beforeEach(async () => {
  server = await createMatchServer(0);
  url = `ws://localhost:${server.port}`;
});

afterEach(async () => {
  await server.close();
});

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function send(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
}

function nextMessage(socket: WebSocket, timeoutMs = 2000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), timeoutMs);
    socket.once("message", (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

describe("matchmaking", () => {
  it("queues the first player and matches the second", async () => {
    const a = await connect();
    const b = await connect();

    send(a, { type: "findMatch" });
    const queuedMsg = await nextMessage(a);
    expect(queuedMsg).toEqual({ type: "queued" });

    send(b, { type: "findMatch" });
    const [foundA, foundB] = await Promise.all([nextMessage(a), nextMessage(b)]);

    expect(foundA.type).toBe("matchFound");
    expect(foundB.type).toBe("matchFound");
    if (foundA.type !== "matchFound" || foundB.type !== "matchFound") throw new Error("unreachable");
    expect([foundA.playerId, foundB.playerId].sort()).toEqual(["A", "B"]);
    expect(foundA.state.turnNumber).toBe(1);
    expect(foundA.state.players.A.hand.length).toBe(5); // opening hand (4) + turn-1 draw (1)

    a.close();
    b.close();
  });
});

describe("deck selection", () => {
  it("uses each player's chosen deckId when building the match", async () => {
    const { FROG_SAMPLE_DECK } = await import("@cryptoclash/engine");
    const a = await connect();
    const b = await connect();

    send(a, { type: "findMatch", deckId: "frogs" });
    await nextMessage(a); // queued
    send(b, { type: "findMatch", deckId: "frogs" });
    const [foundA] = await Promise.all([nextMessage(a), nextMessage(b)]);
    if (foundA.type !== "matchFound") throw new Error("unreachable");

    const frogCardIds = new Set(FROG_SAMPLE_DECK);
    for (const cardId of foundA.state.players.A.hand) {
      expect(frogCardIds.has(cardId)).toBe(true);
    }

    a.close();
    b.close();
  });
});

describe("in-match play", () => {
  async function setUpMatch() {
    const a = await connect();
    const b = await connect();
    send(a, { type: "findMatch" });
    await nextMessage(a); // queued
    send(b, { type: "findMatch" });
    const [foundA, foundB] = await Promise.all([nextMessage(a), nextMessage(b)]);
    if (foundA.type !== "matchFound" || foundB.type !== "matchFound") throw new Error("unreachable");
    const aIsPlayerA = foundA.playerId === "A";
    return { aSocket: a, bSocket: b, aPlayerId: foundA.playerId, bPlayerId: foundB.playerId, aIsPlayerA };
  }

  it("broadcasts the resulting state to both sockets after a legal intent", async () => {
    const { aSocket, bSocket, aPlayerId } = await setUpMatch();

    send(aSocket, { type: "intent", intent: { kind: "endTurn", playerId: aPlayerId } });
    const [stateA, stateB] = await Promise.all([nextMessage(aSocket), nextMessage(bSocket)]);

    expect(stateA.type).toBe("state");
    expect(stateB.type).toBe("state");
    if (stateA.type !== "state") throw new Error("unreachable");
    expect(stateA.state.turnNumber).toBe(1); // still turn 1 — the other player's half
    expect(stateA.state.activePlayer).not.toBe(aPlayerId);

    aSocket.close();
    bSocket.close();
  });

  it("rejects an intent submitted for the wrong player and only errors the sender", async () => {
    const { aSocket, bSocket, bPlayerId } = await setUpMatch();

    // aSocket tries to act as bPlayerId — must be rejected.
    send(aSocket, { type: "intent", intent: { kind: "endTurn", playerId: bPlayerId } });
    const errorMsg = await nextMessage(aSocket);
    expect(errorMsg).toEqual({ type: "error", message: expect.stringMatching(/your own player/i) });

    aSocket.close();
    bSocket.close();
  });

  it("notifies the remaining player when their opponent disconnects", async () => {
    const { aSocket, bSocket } = await setUpMatch();

    aSocket.close();
    const leftMsg = await nextMessage(bSocket);
    expect(leftMsg).toEqual({ type: "opponentLeft" });

    bSocket.close();
  });
});
