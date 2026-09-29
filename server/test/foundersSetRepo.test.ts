import { CARD_POOL } from "@cryptoclash/engine";
import { describe, expect, it } from "vitest";
import { FOUNDERS_SET_CARD_COUNT, rollFoundersSetCards } from "../src/foundersSetRepo.js";

const EDITION_TYPES = new Set(["full_art", "ultra", "secret"]);

describe("rollFoundersSetCards", () => {
  it("is a pure function of its seed — the same seed always rolls the same cards", () => {
    expect(rollFoundersSetCards(42)).toEqual(rollFoundersSetCards(42));
  });

  it("rolls exactly FOUNDERS_SET_CARD_COUNT cards", () => {
    expect(rollFoundersSetCards(1)).toHaveLength(FOUNDERS_SET_CARD_COUNT);
  });

  it("never rolls the 'standard' edition type — the whole point of a Founders Set", () => {
    for (let seed = 0; seed < 500; seed++) {
      for (const card of rollFoundersSetCards(seed)) {
        expect(EDITION_TYPES.has(card.editionType)).toBe(true);
      }
    }
  });

  it("only ever rolls templates that are real, non-token CARD_POOL entries", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const card of rollFoundersSetCards(seed)) {
        const template = CARD_POOL[card.templateId];
        expect(template, `unknown template id "${card.templateId}"`).toBeTruthy();
        expect(template.token).toBeFalsy();
      }
    }
  });

  it("condition grades stay within the real 1-10 range across many seeds", () => {
    for (let seed = 0; seed < 500; seed++) {
      for (const card of rollFoundersSetCards(seed)) {
        expect(card.conditionGrade).toBeGreaterThanOrEqual(1);
        expect(card.conditionGrade).toBeLessThanOrEqual(10);
      }
    }
  });

  it("foil rolls a real, nonzero-but-minority rate over many seeds (mirrors packsRepo.ts's own foil-rate test)", () => {
    let foilCount = 0;
    let total = 0;
    for (let seed = 0; seed < 2000; seed++) {
      for (const card of rollFoundersSetCards(seed)) {
        total++;
        if (card.isFoil) foilCount++;
      }
    }
    const rate = foilCount / total;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.2);
  });

  it("edition tiers skew toward Full Art, with Secret genuinely the rarest — not a flat distribution", () => {
    const counts = { full_art: 0, ultra: 0, secret: 0 };
    for (let seed = 0; seed < 3000; seed++) {
      for (const card of rollFoundersSetCards(seed)) counts[card.editionType]++;
    }
    expect(counts.full_art).toBeGreaterThan(counts.ultra);
    expect(counts.ultra).toBeGreaterThan(counts.secret);
    expect(counts.secret).toBeGreaterThan(0); // rare, but must still be reachable
  });
});
