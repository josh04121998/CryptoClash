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
import { getTodayQuests } from "../src/questsRepo.js";
import { getOrCreateReferralCode, getReferralStats, recordReferralSignup } from "../src/referralsRepo.js";

let server: MatchServerHandle;
let url: string;

beforeEach(async () => {
  server = await createMatchServer(0);
  url = `ws://localhost:${server.port}`;
});

afterEach(async () => {
  await server.close();
});

function connect(targetUrl: string = url): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(targetUrl);
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

  it("holds the match open (grace period, not an immediate end) when their opponent's socket drops unexpectedly", async () => {
    const { aSocket, bSocket } = await setUpMatch();

    aSocket.close();
    // Not an immediate opponentLeft anymore — the seat is held open for reconnection first.
    const disconnectedMsg = await nextMessage(bSocket);
    expect(disconnectedMsg).toEqual({ type: "opponentDisconnected", graceMs: expect.any(Number) });

    bSocket.close();
  });

  it("forfeits the match to the opponent immediately on an intentional leave (no grace period, no forfeit timer)", async () => {
    const { aSocket, bSocket, bPlayerId } = await setUpMatch();

    send(aSocket, { type: "leave" });
    // A real, decided-winner state broadcast right away — no waiting on any grace timer, and
    // the client's existing win/lose overlay is all that's needed to convey it (see forfeit()).
    const stateMsg = await nextMessage(bSocket);
    expect(stateMsg.type).toBe("state");
    if (stateMsg.type !== "state") throw new Error("unreachable");
    expect(stateMsg.state.winner).toBe(bPlayerId);

    aSocket.close();
    bSocket.close();
  });
});

describe("reconnect", () => {
  it(
    "lets the same player resume an in-progress match with a fresh socket after an unexpected disconnect, and the match still reaches a real conclusion",
    async () => {
      const { aSocket, bSocket, aPlayerId, bPlayerId, foundA, foundB } = await setUpMatch();
      if (foundA.type !== "matchFound" || foundB.type !== "matchFound") throw new Error("unreachable");
      const aReconnectToken = foundA.reconnectToken;
      expect(aReconnectToken).toEqual(expect.any(String));

      // Simulate a's connection dropping mid-match (before either side has made a move).
      aSocket.close();
      const disconnectedMsg = await nextMessage(bSocket);
      expect(disconnectedMsg).toEqual({ type: "opponentDisconnected", graceMs: expect.any(Number) });

      // A brand-new socket, presenting the token handed out at matchFound — no accountId
      // involved, so this is the anonymous-play reconnect path.
      const aSocket2 = await connect();
      send(aSocket2, { type: "reconnect", reconnectToken: aReconnectToken });
      const [reconnectedMsg, reconnectedNotice] = await Promise.all([nextMessage(aSocket2), nextMessage(bSocket)]);
      expect(reconnectedNotice).toEqual({ type: "opponentReconnected" });
      expect(reconnectedMsg.type).toBe("reconnected");
      if (reconnectedMsg.type !== "reconnected") throw new Error("unreachable");
      expect(reconnectedMsg.playerId).toBe(aPlayerId);
      expect(reconnectedMsg.state.turnNumber).toBe(foundA.state.turnNumber);
      expect(reconnectedMsg.state.players.A.hand.length).toBe(foundA.state.players.A.hand.length);

      // The match continues correctly over the new socket and reaches a real, engine-decided end.
      const { winner } = await playMatchToConclusion(aSocket2, bSocket, aPlayerId, bPlayerId, reconnectedMsg.state, 15000);
      expect(["A", "B", "Draw"]).toContain(winner);

      aSocket2.close();
      bSocket.close();
    },
    20000,
  );

  it(
    "forfeits the match to the remaining player if the disconnect grace period fully lapses with no reconnect",
    async () => {
      // A short grace period so this test doesn't need to wait out the real ~45s default.
      const shortServer = await createMatchServer(0, { graceMs: 300 });
      try {
        const shortUrl = `ws://localhost:${shortServer.port}`;
        const a = await connect(shortUrl);
        const b = await connect(shortUrl);
        send(a, { type: "findMatch", cards: AGGRO_DECK });
        await nextMessage(a); // queued
        send(b, { type: "findMatch", cards: AGGRO_DECK });
        const [foundA, foundB] = await Promise.all([nextMessage(a), nextMessage(b)]);
        if (foundA.type !== "matchFound" || foundB.type !== "matchFound") throw new Error("unreachable");

        a.close();
        const disconnectedMsg = await nextMessage(b);
        expect(disconnectedMsg).toEqual({ type: "opponentDisconnected", graceMs: 300 });

        // The forfeit fires a normal state broadcast with the winner now decided — the client's
        // existing win/lose overlay is enough to convey it, same as a real engine-decided win.
        const stateMsg = await nextMessage(b, 3000);
        expect(stateMsg.type).toBe("state");
        if (stateMsg.type !== "state") throw new Error("unreachable");
        expect(stateMsg.state.winner).toBe(foundB.playerId);

        // The forfeited player can still reconnect within the post-match hold window and see the
        // real final state (rather than landing on a dead screen) — the token stays valid for
        // this short grace period after conclusion so a late reconnect doesn't just fail outright.
        const aSocket2 = await connect(shortUrl);
        send(aSocket2, { type: "reconnect", reconnectToken: foundA.reconnectToken });
        const reconnectedMsg = await nextMessage(aSocket2, 3000);
        expect(reconnectedMsg.type).toBe("reconnected");
        if (reconnectedMsg.type !== "reconnected") throw new Error("unreachable");
        expect(reconnectedMsg.state.winner).toBe(foundB.playerId);

        aSocket2.close();
        b.close();
      } finally {
        await shortServer.close();
      }
    },
    20000,
  );
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

  /**
   * recordQuestProgress (matchRoom.ts) is a best-effort side-channel — unlike the Coins award,
   * it's not chained to the matchReward WS message, so there's no message to await. Poll briefly
   * instead of assuming it's already landed the instant matchReward arrives.
   */
  async function waitForQuestProgress(accountId: string, questId: string, atLeast: number): Promise<number> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const quests = await getTodayQuests(pool, accountId);
      const progress = quests.find((q) => q.id === questId)?.progress ?? 0;
      if (progress >= atLeast) return progress;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`quest ${questId} never reached progress ${atLeast} for account ${accountId}`);
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

        // Same match also advances the daily-quest "play" track for both participants —
        // the other half of the Coins-earn loop (questsRepo.ts). No "win" quest on a Draw.
        await waitForQuestProgress(accountFor[aPlayerId].accountId, "play_1", 1);
        await waitForQuestProgress(accountFor[bPlayerId].accountId, "play_1", 1);
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

        // Same match also advances the daily-quest "play" track for both participants, and
        // "win" for the actual winner only — the other half of the Coins-earn loop (questsRepo.ts).
        await waitForQuestProgress(accountFor[winner].accountId, "play_1", 1);
        await waitForQuestProgress(accountFor[loser].accountId, "play_1", 1);
        await waitForQuestProgress(accountFor[winner].accountId, "win_1", 1);
        const loserQuests = await getTodayQuests(pool, accountFor[loser].accountId);
        expect(loserQuests.find((q) => q.id === "win_1")!.progress).toBe(0);
      }

      aSocket.close();
      bSocket.close();
    },
    20000,
  );

  it(
    "reconnects a wallet-authenticated player by accountId when the reconnectToken itself wasn't presented, and still awards Coins correctly at conclusion",
    async () => {
      const accountA = await accountToken("0xreconnecta");
      const accountB = await accountToken("0xreconnectb");

      const { aSocket, bSocket, aPlayerId, bPlayerId, foundA, foundB } = await setUpMatch({ a: accountA.token, b: accountB.token });
      if (foundA.type !== "matchFound" || foundB.type !== "matchFound") throw new Error("unreachable");

      // Simulate a's connection dropping — then reconnect from a fresh socket presenting only the
      // wallet session token (no reconnectToken), the fallback path for an authenticated player
      // who lost the in-memory token (e.g. a full page reload).
      aSocket.close();
      await nextMessage(bSocket); // opponentDisconnected

      const aSocket2 = await connect();
      send(aSocket2, { type: "reconnect", token: accountA.token });
      const [reconnectedMsg, reconnectedNotice] = await Promise.all([nextMessage(aSocket2), nextMessage(bSocket)]);
      expect(reconnectedNotice).toEqual({ type: "opponentReconnected" });
      expect(reconnectedMsg.type).toBe("reconnected");
      if (reconnectedMsg.type !== "reconnected") throw new Error("unreachable");
      expect(reconnectedMsg.playerId).toBe(aPlayerId);

      const { winner, messages } = await playMatchToConclusion(aSocket2, bSocket, aPlayerId, bPlayerId, reconnectedMsg.state, 15000);
      expect(["A", "B", "Draw"]).toContain(winner);

      const accountFor: Record<PlayerId, { accountId: string; token: string }> = {
        [aPlayerId]: accountA,
        [bPlayerId]: accountB,
      } as Record<PlayerId, { accountId: string; token: string }>;
      // Rewards still land correctly on the accounts that actually started the match in each
      // seat, even though player A's final socket is a different connection than the one the
      // match began on.
      if (winner !== "Draw") {
        const winnerReward = messages.find((m) => m.playerId === winner && m.message.type === "matchReward")?.message;
        expect(winnerReward?.type).toBe("matchReward");
        if (winnerReward?.type !== "matchReward") throw new Error("unreachable");
        expect(await getBalance(pool, accountFor[winner].accountId)).toBe(winnerReward.balance);
      }

      aSocket2.close();
      bSocket.close();
    },
    20000,
  );

  it(
    "pays out the referrer's free pack once their referred friend finishes a real match",
    async () => {
      const referrer = await accountToken("0xreferrerlive");
      const code = await getOrCreateReferralCode(pool, referrer.accountId);
      const referred = await accountToken("0xreferredlive");
      await recordReferralSignup(pool, referred.accountId, code);
      const opponent = await accountToken("0xreferralopponent");

      const { aSocket, bSocket, aPlayerId, bPlayerId, foundA } = await setUpMatch({ a: referred.token, b: opponent.token });
      await playMatchToConclusion(aSocket, bSocket, aPlayerId, bPlayerId, foundA.state, 15000);

      for (let attempt = 0; attempt < 20; attempt++) {
        const stats = await getReferralStats(pool, referrer.accountId);
        if (stats.rewarded === 1) break;
        if (attempt === 19) throw new Error("referrer was never rewarded after the referred account's match completed");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const stats = await getReferralStats(pool, referrer.accountId);
      expect(stats.rewarded).toBe(1);
      expect(stats.pending).toBe(0);

      aSocket.close();
      bSocket.close();
    },
    20000,
  );
});
