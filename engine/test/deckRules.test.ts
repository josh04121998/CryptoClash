import { describe, expect, it } from "vitest";
import { DECKS } from "../src/cards.js";
import { DECK_SIZE, MAX_COPIES_PER_CARD, validateDeck } from "../src/deckRules.js";

describe("validateDeck", () => {
  it("accepts every pre-built starter deck as-is", () => {
    for (const deck of DECKS) {
      expect(validateDeck(deck.cards), `${deck.name} should be legal`).toEqual([]);
    }
  });

  it("rejects a deck that isn't exactly 30 cards", () => {
    const errors = validateDeck(Array(29).fill("pup_scout"));
    expect(errors.some((e) => e.includes("29 cards"))).toBe(true);
  });

  it(`rejects more than ${MAX_COPIES_PER_CARD} copies of a card`, () => {
    const deck = [...Array(MAX_COPIES_PER_CARD + 1).fill("pup_scout"), ...Array(DECK_SIZE - (MAX_COPIES_PER_CARD + 1)).fill("fast_fang")];
    const errors = validateDeck(deck);
    expect(errors.some((e) => e.includes("Pup Scout"))).toBe(true);
  });

  it("rejects an unknown card id", () => {
    const deck = [...Array(29).fill("pup_scout"), "not_a_real_card"];
    const errors = validateDeck(deck);
    expect(errors.some((e) => e.includes("not_a_real_card"))).toBe(true);
  });

  it("rejects a token card (Puppy) even though it's a valid CARD_POOL id", () => {
    const deck = [...Array(29).fill("pup_scout"), "puppy"];
    const errors = validateDeck(deck);
    expect(errors.some((e) => e.includes("token"))).toBe(true);
  });

  it("accepts exactly at the copy limit", () => {
    const tenDistinctCards = [
      "pup_scout",
      "fast_fang",
      "shield_pup",
      "guard_dog",
      "shadow_pup",
      "moon_dog",
      "diamond_hands",
      "loyal_hound",
      "puppy_swarm",
      "pack_rush",
    ];
    expect(tenDistinctCards.length * MAX_COPIES_PER_CARD).toBe(DECK_SIZE);
    const deck = tenDistinctCards.flatMap((id) => Array(MAX_COPIES_PER_CARD).fill(id));
    expect(validateDeck(deck)).toEqual([]);
  });
});
