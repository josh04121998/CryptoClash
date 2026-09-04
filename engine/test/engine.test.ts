import { describe, expect, it } from "vitest";
import { SAMPLE_DECK } from "../src/cards.js";
import { applyIntent, createMatch } from "../src/engine.js";
import { triggerMarketEvent } from "../src/marketEvents.js";
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

describe("Stealth", () => {
  it("cannot be chosen as an attack target", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 21);
    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn, so B can act
    applyIntent(state, { kind: "playCard", playerId: "B", handIndex: giveCard(state, "B", "shadow_pup"), slot: 0 });
    applyIntent(state, { kind: "endTurn", playerId: "B" }); // -> back to A's turn
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "fast_fang"), slot: 0 }); // has innate Rush

    expect(() =>
      applyIntent(state, {
        kind: "attack",
        playerId: "A",
        attackerSlot: 0,
        target: { type: "creature", playerId: "B", slot: 0 },
      }),
    ).toThrow(/Stealth/);
  });

  it("cannot be chosen as a spell target, and rejecting it doesn't spend energy", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 22);
    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn, so B can act
    applyIntent(state, { kind: "playCard", playerId: "B", handIndex: giveCard(state, "B", "shadow_pup"), slot: 0 });
    applyIntent(state, { kind: "endTurn", playerId: "B" }); // -> back to A's turn
    const handIndex = giveCard(state, "A", "spark_bolt");
    const energyBefore = state.players.A.energy;

    expect(() =>
      applyIntent(state, {
        kind: "playCard",
        playerId: "A",
        handIndex,
        target: { type: "creature", playerId: "B", slot: 0 },
      }),
    ).toThrow(/Stealth/);
    expect(state.players.A.energy).toBe(energyBefore);
  });

  it("is revealed the moment it attacks, after which it can be targeted", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 23);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "shadow_pup"), slot: 0 });
    expect(state.players.A.board[0]!.stealthed).toBe(true);

    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pack_rush") });
    applyIntent(state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: 0,
      target: { type: "player", playerId: "B" },
    });

    expect(state.players.A.board[0]!.stealthed).toBe(false);

    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn
    applyIntent(state, {
      kind: "playCard",
      playerId: "B",
      handIndex: giveCard(state, "B", "spark_bolt"),
      target: { type: "creature", playerId: "A", slot: 0 },
    });
    // Shadow Pup is 1/3; Spark Bolt's 3 damage kills it — reaching this line without a
    // "Stealth" throw already proves the now-revealed creature was a legal spell target.
    expect(state.players.A.board[0]).toBeNull();
  });
});

describe("Burn", () => {
  it("deals damage at the end of each turn for the stated number of turns, then stops", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 25);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "ember_curse") });
    const hpAfterCast = state.players.B.hp;

    applyIntent(state, { kind: "endTurn", playerId: "A" }); // tick 1 (end of A's turn)
    expect(state.players.B.hp).toBe(hpAfterCast - 1);

    applyIntent(state, { kind: "endTurn", playerId: "B" }); // tick 2
    applyIntent(state, { kind: "endTurn", playerId: "A" }); // tick 3 — burn should now be exhausted
    expect(state.players.B.hp).toBe(hpAfterCast - 3);
    expect(state.activeBurns.length).toBe(0);

    const hpAfterThreeTicks = state.players.B.hp;
    applyIntent(state, { kind: "endTurn", playerId: "B" }); // no more burn damage
    expect(state.players.B.hp).toBe(hpAfterThreeTicks);
  });
});

describe("Volatility & Market Events", () => {
  it("rises and falls within [0,10] as cards direct", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 27);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pump_signal") });
    expect(state.volatility).toBe(4);

    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "cool_down") });
    expect(state.volatility).toBe(1);
  });

  it("triggers a Market Event and resets to 0 once it reaches 10", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 29);
    state.volatility = 9;
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pump_signal") });

    expect(state.volatility).toBe(0);
    expect(state.log.some((e) => e.text.includes("reaches 10"))).toBe(true);
  });

  it("MARKET_CRASH deals 2 damage to the strongest creature on each side", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 31);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "loyal_hound"), slot: 0 }); // 5/5
    applyIntent(state, { kind: "endTurn", playerId: "A" });
    applyIntent(state, { kind: "playCard", playerId: "B", handIndex: giveCard(state, "B", "diamond_hands"), slot: 0 }); // 2/6

    triggerMarketEvent(state, "MARKET_CRASH");

    expect(state.players.A.board[0]!.health).toBe(3);
    expect(state.players.B.board[0]!.health).toBe(4);
  });

  it("PUMP gives every creature on the board +1 Attack for the rest of the turn only", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 33);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "loyal_hound"), slot: 0 });
    const before = getEffectiveAttack(state, "A", 0);

    triggerMarketEvent(state, "PUMP");
    expect(getEffectiveAttack(state, "A", 0)).toBe(before + 1);

    applyIntent(state, { kind: "endTurn", playerId: "A" });
    applyIntent(state, { kind: "endTurn", playerId: "B" }); // back to A's turn — PUMP bonus should be cleared
    expect(getEffectiveAttack(state, "A", 0)).toBe(before);
  });

  it("LIQUIDATION docks 2 Energy from both players' next turn only", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 35);
    triggerMarketEvent(state, "LIQUIDATION");

    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn 1: maxEnergy 1, penalty 2 -> energy 0
    expect(state.players.B.energy).toBe(0);

    applyIntent(state, { kind: "endTurn", playerId: "B" });
    applyIntent(state, { kind: "endTurn", playerId: "A" }); // -> B's turn 2: no penalty left, maxEnergy 2
    expect(state.players.B.energy).toBe(2);
  });

  it("FOMO draws both players a card", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 37);
    const aBefore = state.players.A.hand.length;
    const bBefore = state.players.B.hand.length;

    triggerMarketEvent(state, "FOMO");

    expect(state.players.A.hand.length).toBe(aBefore + 1);
    expect(state.players.B.hand.length).toBe(bBefore + 1);
  });

  it("BLACK_SWAN resolves to exactly one of the other four events", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 39);
    triggerMarketEvent(state, "BLACK_SWAN");

    const resolvedOneOf = ["MARKET CRASH", "PUMP —", "LIQUIDATION", "FOMO —"];
    expect(resolvedOneOf.some((marker) => state.log.some((e) => e.text.includes(marker)))).toBe(true);
  });
});

describe("Builders — draw effect", () => {
  it("a creature's onPlay draw adds a card to its controller's hand", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 41);
    const before = state.players.A.hand.length;
    // giveCard itself pushes into hand, so account for that +1 before the effect fires.
    const idx = giveCard(state, "A", "junior_dev");
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: idx, slot: 0 });

    // hand: +1 (junior_dev added by giveCard) -1 (played) +1 (its own draw effect) = before + 1
    expect(state.players.A.hand.length).toBe(before + 1);
  });

  it("Blueprint draws two cards", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 43);
    const before = state.players.A.hand.length;
    const idx = giveCard(state, "A", "blueprint");
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: idx });

    // +1 (blueprint added) -1 (played) +2 (draw two) = before + 2
    expect(state.players.A.hand.length).toBe(before + 2);
  });

  it("Iteration Cycle draws a card at the start of every one of its controller's turns", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 45);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "iteration_cycle"), slot: 0 });
    const before = state.players.A.hand.length;

    applyIntent(state, { kind: "endTurn", playerId: "A" });
    applyIntent(state, { kind: "endTurn", playerId: "B" }); // back to A — startTurn fires the draw + the normal turn draw

    expect(state.players.A.hand.length).toBe(before + 2);
  });
});

describe("Frogs — copyRandomFriendly effect", () => {
  it("Mimic Frog copies an existing friendly creature into an empty slot", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 47);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "loyal_hound"), slot: 0 }); // 5/5

    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "mimic_frog"), slot: 1 });

    const copy = state.players.A.board.find((c, slot) => slot !== 0 && slot !== 1 && c?.templateId === "loyal_hound");
    expect(copy).toBeDefined();
    expect(copy!.health).toBe(5);
  });

  it("fizzles safely (logs, doesn't throw) when there's nothing on the board to copy", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 49);
    expect(() =>
      applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "mimic_frog"), slot: 0 }),
    ).not.toThrow();
    expect(state.log.some((e) => e.text.includes("nothing to copy"))).toBe(true);
  });

  it("Deep Croak never copies itself, only other friendly creatures", () => {
    const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, 51);
    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "pup_scout"), slot: 0 });

    applyIntent(state, { kind: "playCard", playerId: "A", handIndex: giveCard(state, "A", "deep_croak"), slot: 1 });

    const deepCroakCopies = state.players.A.board.filter((c) => c?.templateId === "deep_croak");
    // Only the one played from hand — copyRandomFriendly excludes its own board slot as a source.
    expect(deepCroakCopies.length).toBe(1);
  });
});
