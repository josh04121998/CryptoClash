import { CARD_POOL, PlayerId, TargetRef } from "@cryptoclash/engine";
import { ClientMessage, NetworkMatchState, ServerMessage } from "@cryptoclash/protocol";
import { Pool } from "pg";
import { WebSocket } from "ws";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findOrCreateAccount } from "../src/accounts.js";
import { issueSessionToken } from "../src/auth.js";
import { getBalance } from "../src/coinsRepo.js";
import { createMatchServer, MatchServerHandle } from "../src/createMatchServer.js";
import { runMigrations } from "../src/migrate.js";

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
  it("uses each player's submitted cards when building the match", async () => {
    const { FROG_SAMPLE_DECK } = await import("@cryptoclash/engine");
    const a = await connect();
    const b = await connect();

    send(a, { type: "findMatch", cards: FROG_SAMPLE_DECK });
    await nextMessage(a); // queued
    send(b, { type: "findMatch", cards: FROG_SAMPLE_DECK });
    const [foundA] = await Promise.all([nextMessage(a), nextMessage(b)]);
    if (foundA.type !== "matchFound") throw new Error("unreachable");

    const frogCardIds = new Set(FROG_SAMPLE_DECK);
    for (const cardId of foundA.state.players.A.hand) {
      expect(frogCardIds.has(cardId)).toBe(true);
    }

    a.close();
    b.close();
  });

  it("falls back to the default deck when a client submits an illegal card list", async () => {
    const { SAMPLE_DECK } = await import("@cryptoclash/engine");
    const a = await connect();
    const b = await connect();

    // Not a legal 30-card deck (way over the copy limit, wrong size) — the server must not trust it as-is.
    send(a, { type: "findMatch", cards: Array(30).fill("pup_scout") });
    await nextMessage(a); // queued
    send(b, { type: "findMatch" }); // no cards at all — also falls back
    const [foundA] = await Promise.all([nextMessage(a), nextMessage(b)]);
    if (foundA.type !== "matchFound") throw new Error("unreachable");

    const defaultCardIds = new Set(SAMPLE_DECK);
    for (const cardId of foundA.state.players.A.hand) {
      expect(defaultCardIds.has(cardId)).toBe(true);
    }

    a.close();
    b.close();
  });
});

/**
 * A pure-creature, no-target-required deck (10 distinct ids x 3 copies = the
 * required 30) so a simple scripted "bot" can play every card in hand without
 * needing to choose a spell target — used only to drive a match to a real,
 * engine-decided win in the tests below.
 */
const AGGRO_DECK = Array(3).fill([
  "fast_fang",
  "pup_scout",
  "shield_pup",
  "moon_dog",
  "guard_dog",
  "diamond_hands",
  "loyal_hound",
  "shadow_pup",
  "leap_frog",
  "warty_lookout",
]).flat();

async function setUpMatch(tokens: { a?: string; b?: string } = {}) {
  const a = await connect();
  const b = await connect();
  send(a, { type: "findMatch", cards: AGGRO_DECK, token: tokens.a });
  await nextMessage(a); // queued
  send(b, { type: "findMatch", cards: AGGRO_DECK, token: tokens.b });
  const [foundA, foundB] = await Promise.all([nextMessage(a), nextMessage(b)]);
  if (foundA.type !== "matchFound" || foundB.type !== "matchFound") throw new Error("unreachable");
  const aIsPlayerA = foundA.playerId === "A";
  return { aSocket: a, bSocket: b, aPlayerId: foundA.playerId, bPlayerId: foundB.playerId, aIsPlayerA, foundA, foundB };
}

function enemyOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

/** Greedy "develop the board, then attack face" script — good enough to reliably reach a real win, not meant to be a good player. */
function chooseIntent(playerId: PlayerId, state: NetworkMatchState): ClientMessage | null {
  if (state.winner || state.activePlayer !== playerId) return null;
  const player = state.players[playerId];

  for (let i = 0; i < player.hand.length; i++) {
    const template = CARD_POOL[player.hand[i]];
    if (!template || template.type !== "Creature" || template.cost > player.energy) continue;
    const slot = player.board.findIndex((c) => c === null);
    if (slot === -1) continue;
    return { type: "intent", intent: { kind: "playCard", playerId, handIndex: i, slot } };
  }

  // Attacking the enemy face is illegal while they have a live Guard creature — it must be
  // attacked first (combat.ts). Find one up front so the bot never sends an intent the engine rejects.
  const enemyBoard = state.players[enemyOf(playerId)].board;
  const enemyGuardSlot = enemyBoard.findIndex((c) => c && (c.keywords.includes("Guard") || c.tempKeywords.includes("Guard")));

  for (let slot = 0; slot < player.board.length; slot++) {
    const creature = player.board[slot];
    if (!creature || creature.hasAttackedThisTurn) continue;
    const hasRush = creature.keywords.includes("Rush") || creature.tempKeywords.includes("Rush");
    if (creature.summonedOnTurn === state.turnNumber && !hasRush) continue;
    const target: TargetRef =
      enemyGuardSlot !== -1
        ? { type: "creature", playerId: enemyOf(playerId), slot: enemyGuardSlot }
        : { type: "player", playerId: enemyOf(playerId) };
    return { type: "intent", intent: { kind: "attack", playerId, attackerSlot: slot, target } };
  }

  return { type: "intent", intent: { kind: "endTurn", playerId } };
}

/**
 * Drives a real match to a real, engine-decided win purely by reacting to the
 * actual server-broadcast state over the two live sockets (no reaching into
 * MatchRoom's private state) — both players run the same greedy script, so
 * whichever hand/turn order favors wins first. Resolves with every
 * ServerMessage either socket received, so callers can assert on matchReward.
 *
 * matchReward (when it happens at all) is sent *after* the concluding `state`
 * broadcast — awardMatchRewards awaits a real Postgres round-trip first — so
 * this waits a short grace period past the conclusion before resolving,
 * rather than resolving the instant `state.winner` is first seen.
 */
function playMatchToConclusion(
  aSocket: WebSocket,
  bSocket: WebSocket,
  aPlayerId: PlayerId,
  bPlayerId: PlayerId,
  initialState: NetworkMatchState,
  timeoutMs = 20000,
  rewardGraceMs = 1000,
): Promise<{ winner: NonNullable<NetworkMatchState["winner"]>; messages: { playerId: PlayerId; message: ServerMessage }[] }> {
  return new Promise((resolve, reject) => {
    const messages: { playerId: PlayerId; message: ServerMessage }[] = [];
    const timer = setTimeout(() => reject(new Error("match did not conclude within the timeout")), timeoutMs);
    let settled = false;
    let concludedWinner: NonNullable<NetworkMatchState["winner"]> | null = null;

    function finalize() {
      if (settled || concludedWinner === null) return;
      settled = true;
      clearTimeout(timer);
      resolve({ winner: concludedWinner, messages });
    }

    function handleState(playerId: PlayerId, socket: WebSocket, state: NetworkMatchState) {
      if (settled || concludedWinner !== null) return;
      if (state.winner) {
        concludedWinner = state.winner;
        setTimeout(finalize, rewardGraceMs);
        return;
      }
      const next = chooseIntent(playerId, state);
      if (next) send(socket, next);
    }

    function wire(socket: WebSocket, playerId: PlayerId) {
      socket.on("message", (raw) => {
        const message: ServerMessage = JSON.parse(raw.toString());
        messages.push({ playerId, message });
        if (message.type === "state" || message.type === "matchFound") handleState(playerId, socket, message.state);
      });
    }

    wire(aSocket, aPlayerId);
    wire(bSocket, bPlayerId);
    handleState(aPlayerId, aSocket, initialState); // kick off turn 1 (always A's turn)
  });
}

describe("in-match play", () => {
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

describe("match rewards (Coins)", () => {
  it(
    "an unauthenticated match plays to a real conclusion with no matchReward and no crash",
    async () => {
      const { aSocket, bSocket, aPlayerId, bPlayerId, foundA } = await setUpMatch(); // no tokens — anonymous play
      const { winner, messages } = await playMatchToConclusion(aSocket, bSocket, aPlayerId, bPlayerId, foundA.state, 15000);

      expect(["A", "B", "Draw"]).toContain(winner);
      // The conclusion really did reach both sockets as a normal state broadcast...
      expect(
        messages.some((m) => m.message.type === "state" && m.message.state.winner === winner),
      ).toBe(true);
      // ...but since neither session carried a token, nobody has an account to reward.
      expect(messages.some((m) => m.message.type === "matchReward")).toBe(false);

      aSocket.close();
      bSocket.close();
    },
    20000,
  );
});

const databaseUrl = process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d("match rewards (Coins), authenticated (integration, real Postgres)", () => {
  let pool: Pool;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
    pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    await pool.query("delete from decks");
    await pool.query("delete from accounts");
  });

  async function accountToken(walletAddress: string): Promise<{ accountId: string; token: string }> {
    const account = await findOrCreateAccount(pool, walletAddress);
    const token = await issueSessionToken({ accountId: account.id, walletAddress: account.walletAddress });
    return { accountId: account.id, token };
  }

  it(
    "credits real Postgres Coins to both wallet-linked accounts, more to the winner than the loser, and reports the true balance",
    async () => {
      const accountA = await accountToken("0xplayera");
      const accountB = await accountToken("0xplayerb");

      const { aSocket, bSocket, aPlayerId, bPlayerId, foundA } = await setUpMatch({ a: accountA.token, b: accountB.token });
      const { winner, messages } = await playMatchToConclusion(aSocket, bSocket, aPlayerId, bPlayerId, foundA.state, 15000);

      const accountFor: Record<PlayerId, { accountId: string; token: string }> = {
        [aPlayerId]: accountA,
        [bPlayerId]: accountB,
      } as Record<PlayerId, { accountId: string; token: string }>;

      const rewardFor = (playerId: PlayerId) => messages.find((m) => m.playerId === playerId && m.message.type === "matchReward")?.message;

      if (winner === "Draw") {
        expect(rewardFor(aPlayerId)?.type).toBe("matchReward");
        expect(rewardFor(bPlayerId)?.type).toBe("matchReward");
      } else {
        const loser = enemyOf(winner);
        const winnerReward = rewardFor(winner);
        const loserReward = rewardFor(loser);
        expect(winnerReward?.type).toBe("matchReward");
        expect(loserReward?.type).toBe("matchReward");
        if (winnerReward?.type !== "matchReward" || loserReward?.type !== "matchReward") throw new Error("unreachable");
        expect(winnerReward.coinsEarned).toBeGreaterThan(loserReward.coinsEarned);

        expect(await getBalance(pool, accountFor[winner].accountId)).toBe(winnerReward.balance);
        expect(await getBalance(pool, accountFor[loser].accountId)).toBe(loserReward.balance);
      }

      aSocket.close();
      bSocket.close();
    },
    20000,
  );
});
