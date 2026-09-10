import { createMatch, injectCreature, MatchState } from "@cryptoclash/engine";
import { describe, expect, it } from "vitest";
import { afterIntent, gateIntent, initialTutorialController, spotlightFor, TutorialControllerState } from "./beats.js";

const SEED = 1234;

/** A fresh tutorial-mode match — same shape useTutorialMatch.ts creates, minimal deck is fine since these tests build board/hand state directly. */
function freshMatch(): MatchState {
  return createMatch(["pup_scout"], ["pup_scout"], SEED, { tutorial: true });
}

function ctrlAt(overrides: Partial<TutorialControllerState>): TutorialControllerState {
  return { ...initialTutorialController(), preMatchAck: true, ...overrides };
}

describe("gateIntent — beat 1 (play a 1-drop)", () => {
  it("rejects any intent that isn't playing a card", () => {
    const state = freshMatch();
    const gate = gateIntent(ctrlAt({ beat: 1 }), state, { kind: "endTurn", playerId: "A" });
    expect(gate.ok).toBe(false);
  });

  it("rejects playing a card that isn't a 1-cost creature", () => {
    const state = freshMatch();
    state.players.A.hand.push("shield_pup"); // 2-cost creature
    const handIndex = state.players.A.hand.length - 1;

    const gate = gateIntent(ctrlAt({ beat: 1 }), state, {
      kind: "playCard",
      playerId: "A",
      handIndex,
      slot: 0,
    });
    expect(gate.ok).toBe(false);
  });

  it("accepts a 1-cost creature and advances to beat 2", () => {
    const state = freshMatch();
    state.players.A.hand.push("pup_scout"); // 1-cost creature
    const handIndex = state.players.A.hand.length - 1;

    const gate = gateIntent(ctrlAt({ beat: 1 }), state, {
      kind: "playCard",
      playerId: "A",
      handIndex,
      slot: 0,
    });
    expect(gate.ok).toBe(true);
    expect(gate.ok && gate.advance).toEqual({ beat: 2, step: "primary", feedback: null });
  });
});

describe("gateIntent — beat 2 (summoning sickness)", () => {
  it("blocks attacking on the primary step and moves to the afterSickness step", () => {
    const state = freshMatch();
    const slot = injectCreature(state, "A", "pup_scout");

    const gate = gateIntent(ctrlAt({ beat: 2, step: "primary" }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: slot,
      target: { type: "player", playerId: "B" },
    });

    expect(gate.ok).toBe(false);
    expect(!gate.ok && gate.advance).toEqual({ step: "afterSickness", feedback: expect.any(String) });
  });

  it("refuses to let the player skip straight to End Turn before trying to attack", () => {
    const state = freshMatch();
    const gate = gateIntent(ctrlAt({ beat: 2, step: "primary" }), state, {
      kind: "endTurn",
      playerId: "A",
    });
    expect(gate.ok).toBe(false);
  });

  it("requires End Turn once on the afterSickness step, then advances to beat 3", () => {
    const state = freshMatch();
    const notEndTurn = gateIntent(ctrlAt({ beat: 2, step: "afterSickness" }), state, {
      kind: "endTurn",
      playerId: "A",
    });
    expect(notEndTurn.ok).toBe(true);
    expect(notEndTurn.ok && notEndTurn.advance).toEqual({ beat: 3, step: "primary", feedback: null });

    const wrongIntent = gateIntent(ctrlAt({ beat: 2, step: "afterSickness" }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: 0,
      target: { type: "player", playerId: "B" },
    });
    expect(wrongIntent.ok).toBe(false);
  });
});

// Regression coverage for the 2026-09-10 fix: beat 3's gate originally let the
// player pass the "attack with your Rush creature" lesson by attacking face
// with an old non-Rush creature instead. The fix checks the actual attacking
// creature's keywords/tempKeywords for "Rush" before allowing a face attack.
describe("gateIntent — beat 3 (Rush gating)", () => {
  it("rejects a face attack from a non-Rush attacker, even one that's long past summoning sickness", () => {
    const state = freshMatch();
    const slot = injectCreature(state, "A", "pup_scout"); // no Rush keyword
    state.players.A.board[slot]!.summonedOnTurn = state.turnNumber - 5; // definitely not "just summoned"

    const gate = gateIntent(ctrlAt({ beat: 3 }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: slot,
      target: { type: "player", playerId: "B" },
    });

    expect(gate.ok).toBe(false);
    expect(!gate.ok && gate.feedback).toMatch(/Rush/);
  });

  it("accepts a face attack from a Rush creature summoned this very turn", () => {
    const state = freshMatch();
    const slot = injectCreature(state, "A", "fast_fang"); // innate Rush, summonedOnTurn === current turn

    const gate = gateIntent(ctrlAt({ beat: 3 }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: slot,
      target: { type: "player", playerId: "B" },
    });

    expect(gate.ok).toBe(true);
    expect(gate.ok && gate.advance).toEqual({ beat: 4, step: "primary", feedback: null });
  });

  it("does not require Rush for attacking an enemy creature (only face attacks are gated)", () => {
    const state = freshMatch();
    const attackerSlot = injectCreature(state, "A", "pup_scout"); // no Rush
    state.players.A.board[attackerSlot]!.summonedOnTurn = state.turnNumber - 5;
    const targetSlot = injectCreature(state, "B", "pup_scout");

    const gate = gateIntent(ctrlAt({ beat: 3 }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot,
      target: { type: "creature", playerId: "B", slot: targetSlot },
    });

    expect(gate.ok).toBe(true);
  });

  it("detours to beat 4 (with sawGuard latched) instead of letting a Rush face attack through when the enemy has a Guard up", () => {
    const state = freshMatch();
    const attackerSlot = injectCreature(state, "A", "fast_fang");
    injectCreature(state, "B", "shield_pup"); // Guard

    const gate = gateIntent(ctrlAt({ beat: 3 }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot,
      target: { type: "player", playerId: "B" },
    });

    expect(gate.ok).toBe(false);
    expect(!gate.ok && gate.advance).toEqual({
      beat: 4,
      step: "primary",
      feedback: expect.any(String),
      sawGuard: true,
    });
  });

  it("allows playing a card or ending on a creature attack, but blocks ending the turn outright", () => {
    const state = freshMatch();
    expect(
      gateIntent(ctrlAt({ beat: 3 }), state, { kind: "playCard", playerId: "A", handIndex: 0 }).ok,
    ).toBe(true);
    expect(gateIntent(ctrlAt({ beat: 3 }), state, { kind: "endTurn", playerId: "A" }).ok).toBe(false);
  });
});

describe("gateIntent — beat 4 (clear the Guard before face)", () => {
  it("lets anything through once the Guard beat hasn't actually started yet (no Guard seen, none up now)", () => {
    const state = freshMatch();
    const gate = gateIntent(ctrlAt({ beat: 4, sawGuard: false }), state, {
      kind: "endTurn",
      playerId: "A",
    });
    expect(gate.ok).toBe(true);
  });

  it("blocks ending the turn while a Guard is up", () => {
    const state = freshMatch();
    injectCreature(state, "B", "shield_pup");
    const gate = gateIntent(ctrlAt({ beat: 4, sawGuard: true }), state, {
      kind: "endTurn",
      playerId: "A",
    });
    expect(gate.ok).toBe(false);
  });

  it("blocks attacking face while a Guard is up", () => {
    const state = freshMatch();
    injectCreature(state, "B", "shield_pup");
    const gate = gateIntent(ctrlAt({ beat: 4, sawGuard: true }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: 0,
      target: { type: "player", playerId: "B" },
    });
    expect(gate.ok).toBe(false);
  });

  it("blocks attacking a non-Guard creature while the Guard is still up", () => {
    const state = freshMatch();
    const guardSlot = injectCreature(state, "B", "shield_pup");
    const otherSlot = guardSlot === 0 ? 1 : 0;
    injectCreature(state, "B", "pup_scout", otherSlot);

    const gate = gateIntent(ctrlAt({ beat: 4, sawGuard: true }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: 0,
      target: { type: "creature", playerId: "B", slot: otherSlot },
    });
    expect(gate.ok).toBe(false);
  });

  it("accepts attacking the Guard itself", () => {
    const state = freshMatch();
    const guardSlot = injectCreature(state, "B", "shield_pup");

    const gate = gateIntent(ctrlAt({ beat: 4, sawGuard: true }), state, {
      kind: "attack",
      playerId: "A",
      attackerSlot: 0,
      target: { type: "creature", playerId: "B", slot: guardSlot },
    });
    expect(gate.ok).toBe(true);
  });
});

describe("afterIntent — beat 4 to 5 transition once the Guard departs", () => {
  it("advances from beat 4 to beat 5 once the Guard is gone after having been seen", () => {
    const state = freshMatch(); // no Guard on board
    const patch = afterIntent(ctrlAt({ beat: 4, sawGuard: true }), state);
    expect(patch).toEqual({ beat: 5, step: "primary", feedback: null });
  });

  it("latches sawGuard the moment a Guard appears, without advancing the beat yet", () => {
    const state = freshMatch();
    injectCreature(state, "B", "shield_pup");
    const patch = afterIntent(ctrlAt({ beat: 4, sawGuard: false }), state);
    expect(patch).toEqual({ sawGuard: true });
  });

  it("does nothing once beatsComplete is true", () => {
    const state = freshMatch();
    const patch = afterIntent(ctrlAt({ beat: 4, sawGuard: true, beatsComplete: true }), state);
    expect(patch).toBeNull();
  });

  it("does nothing outside beat 4 when there's no Guard to latch onto", () => {
    const state = freshMatch();
    const patch = afterIntent(ctrlAt({ beat: 2, sawGuard: false }), state);
    expect(patch).toBeNull();
  });
});

describe("spotlightFor", () => {
  it("returns none before the pre-match ack or once beats are complete", () => {
    const state = freshMatch();
    expect(spotlightFor(ctrlAt({ beat: 1, preMatchAck: false }), state)).toEqual({ kind: "none" });
    expect(spotlightFor(ctrlAt({ beat: 1, beatsComplete: true }), state)).toEqual({ kind: "none" });
  });

  it("points at the first empty slot on beat 1", () => {
    const state = freshMatch();
    expect(spotlightFor(ctrlAt({ beat: 1 }), state)).toEqual({ kind: "emptySlot", slot: 0 });
  });

  it("points at End Turn once beat 2 has moved past the sickness step", () => {
    const state = freshMatch();
    expect(spotlightFor(ctrlAt({ beat: 2, step: "afterSickness" }), state)).toEqual({ kind: "endTurn" });
  });
});
