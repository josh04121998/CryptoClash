import { describe, expect, it } from "vitest";
import { SAMPLE_DECK } from "../src/cards.js";
import { applyIntent, createMatch } from "../src/engine.js";
import { getEffectiveAttack } from "../src/stats.js";
import { MatchState, PlayerId } from "../src/types.js";

describe("determinism", () => {
  it("produces identical opening state for the same seed", () => {
    const a = createMatch(SAMPLE_DECK, SAMPLE_DECK, 7);
    const b = createMatch(SAMPLE_DECK, SAMPLE_DECK, 7);
    expect(a.players.A.hand).toEqual(b.players.A.hand);
    expect(a.players.B.hand).toEqual(b.players.B.hand);
    expect(a.players.A.deck).toEqual(b.players.A.deck);
  });

  it("produces different hands for different seeds", () => {
    const a = createMatch(SAMPLE_DECK, SAMPLE_DECK, 1);
    const b = createMatch(SAMPLE_DECK, SAMPLE_DECK, 2);
    expect(a.players.A.hand).not.toEqual(b.players.A.hand);
  });
});

describe("turn loop basics", () => {
  it("deals a 4-card opening hand and grants 1 energy on turn 1", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 1);
    // Opening hand (4) + turn-1 draw (1) = 5.
    expect(state.players.A.hand.length).toBe(5);
    expect(state.players.A.energy).toBe(1);
    expect(state.players.A.maxEnergy).toBe(1);
  });

  it("increases max energy by 1 per own turn, capped at 10", () => {
    let state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 1);
    for (let i = 0; i < 20; i++) {
      state = applyIntent(state, { kind: "endTurn", playerId: state.activePlayer });
    }
    expect(state.players.A.maxEnergy).toBeLessThanOrEqual(10);
    expect(state.players.B.maxEnergy).toBeLessThanOrEqual(10);
  });
});

/** Test-only helper: force a specific card into a player's hand and give enough energy to cast it. */
function giveCard(state: MatchState, playerId: PlayerId, templateId: string): number {
  state.players[playerId].hand.push(templateId);
  state.players[playerId].energy = state.players[playerId].maxEnergy = 10;
  return state.players[playerId].hand.length - 1;
}

describe("Moon Dog adjacency aura", () => {
  it("buffs a same-faction creature placed next to it, and stops buffing once it dies", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 3);

    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "moon_dog"), slot: 2 });
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "fast_fang"), slot: 1 });

    // Fast Fang is 2/1 base, adjacent to Moon Dog (+1 Attack aura) => 3.
    expect(getEffectiveAttack(state, "A", 1)).toBe(3);

    // Remove Moon Dog and confirm the aura bonus disappears (it's computed live, not baked in).
    state.players.A.board[2] = null;
    expect(getEffectiveAttack(state, "A", 1)).toBe(2);
  });
});

describe("Puppy Swarm", () => {
  it("summons two 1/1 Puppy tokens onto empty slots", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 5);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "puppy_swarm") });

    const puppies = state.players.A.board.filter((c) => c?.templateId === "puppy");
    expect(puppies.length).toBe(2);
    expect(puppies[0]!.health).toBe(1);
  });
});

describe("Rush and Pack Rush", () => {
  it("blocks a freshly summoned non-Rush creature from attacking the same turn", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 9);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pup_scout"), slot: 0 });

    expect(() =>
      applyIntent(state, {
        kind: "attack",
        playerId: "A",
        attackerSlot: 0,
        target: { type: "player", playerId: "B" },
      }),
    ).toThrow(/summoned/);
  });

  it("lets a freshly summoned creature attack once Pack Rush grants it Rush", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 9);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pup_scout"), slot: 0 });
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pack_rush") });

    expect(state.players.A.board[0]!.tempKeywords.has("Rush")).toBe(true);
    expect(() =>
      applyIntent(state, {
        kind: "attack",
        playerId: "A",
        attackerSlot: 0,
        target: { type: "player", playerId: "B" },
      }),
    ).not.toThrow();
  });
});

describe("Guard", () => {
  it("blocks a direct attack on the player until the Guard creature is dealt with", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 11);

    applyIntent(state, { kind: "endTurn", playerId: "A" });
    applyIntent(state, { kind: "playCard", playerId: "B", handIndex: giveCard(state, "B", "shield_pup"), slot: 0 });
    applyIntent(state, { kind: "endTurn", playerId: "B" });

    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "fast_fang"), slot: 4 });

    expect(() =>
      applyIntent(state, {
        kind: "attack",
        playerId: "A",
        attackerSlot: 4,
        target: { type: "player", playerId: "B" },
      }),
    ).toThrow(/Guard/);

    expect(() =>
      applyIntent(state, {
        kind: "attack",
        playerId: "A",
        attackerSlot: 4,
        target: { type: "creature", playerId: "B", slot: 0 },
      }),
    ).not.toThrow();
  });
});

describe("Spark Bolt", () => {
  it("deals 3 damage to the chosen target", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 13);
    const hpBefore = state.players.B.hp;
    applyIntent(state, {
      kind: "playCard",
      playerId: "A",
      handIndex: giveCard(state, "A", "spark_bolt"),
      target: { type: "player", playerId: "B" },
    });
    expect(state.players.B.hp).toBe(hpBefore - 3);
  });
});

describe("HODL", () => {
  it("gains +1 Attack at the start of each of its controller's turns", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 15);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "diamond_hands"), slot: 0 });
    const baseAttack = getEffectiveAttack(state, "A", 0);

    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn
    applyIntent(state, { kind: "endTurn", playerId: "B" }); // -> A's turn, HODL should trigger

    expect(getEffectiveAttack(state, "A", 0)).toBe(baseAttack + 1);
  });
});

describe("fatigue", () => {
  it("damages a player who must draw from an empty deck, with escalating damage", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 1);
    state.players.B.deck = [];
    const hpBefore = state.players.B.hp;

    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn, B draws from empty deck

    expect(state.players.B.hp).toBe(hpBefore - 1);
    expect(state.players.B.fatigue).toBe(1);
  });
});
