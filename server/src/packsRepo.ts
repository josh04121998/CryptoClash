import { CARD_POOL, mulberry32, Rarity } from "@cryptoclash/engine";
import { randomInt } from "node:crypto";
import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./coinsRepo.js";
import { grantCardInstances, PackCard } from "./collectionRepo.js";

export interface PackDefinition {
  id: string;
  name: string;
  cost: number;
  cardCount: number;
}

/** One pack type for now (spec.md Section 17's literal example: 1,000 Coins, 5 cards). */
export const PACK_DEFINITIONS: Record<string, PackDefinition> = {
  standard: { id: "standard", name: "Standard Pack", cost: 1000, cardCount: 5 },
};

export class InsufficientCoinsError extends Error {}
export class UnknownPackTypeError extends Error {}

type RarityOdds = [Rarity, number][];

/**
 * Rarities a pack is allowed to roll. Mythic and Genesis are deliberately
 * excluded, even once templates using them exist — spec.md Section 16
 * promises Genesis a permanently capped, hand-picked total supply (~10-100),
 * and a random pack outcome would quietly erode "permanently capped" a
 * little more with every pack opened industry-wide. Both tiers are reserved
 * for event/achievement grants outside this RNG path, not something to wire
 * into NORMAL_ODDS/LAST_SLOT_ODDS below later without re-reading this.
 */
const PACK_ELIGIBLE_RARITIES: ReadonlySet<Rarity> = new Set(["Common", "Uncommon", "Rare", "Epic", "Legendary"]);

/**
 * Real first-pass odds design (2026-09-07), replacing the earlier "everything
 * basically Common" placeholder — see spec.md Section 17. Every slot but the
 * last rolls NORMAL_ODDS; the last rolls the richer LAST_SLOT_ODDS so every
 * pack guarantees at least one Uncommon+ ("guaranteed baseline value").
 * Against today's pool (18 Common / 21 Uncommon / 12 Rare / 6 Epic / 6
 * Legendary), expected Legendary pulls/pack ≈ 0.038 (~1 every 26 packs, i.e.
 * 26,000 Coins) and Epic+ ≈ 0.23/pack (4 × (0.018+0.002) + (0.12+0.03)) — a
 * real long-tail chase curve. Still a
 * first design pass to revisit against actual play telemetry before launch,
 * not final tuned numbers (same caveat as cards.ts's rarity heuristic).
 */
const NORMAL_ODDS: RarityOdds = [
  ["Common", 0.65],
  ["Uncommon", 0.25],
  ["Rare", 0.08],
  ["Epic", 0.018],
  ["Legendary", 0.002],
];
const LAST_SLOT_ODDS: RarityOdds = [
  ["Uncommon", 0.52],
  ["Rare", 0.33],
  ["Epic", 0.12],
  ["Legendary", 0.03],
];

for (const odds of [NORMAL_ODDS, LAST_SLOT_ODDS]) {
  for (const [rarity] of odds) {
    if (!PACK_ELIGIBLE_RARITIES.has(rarity)) {
      throw new Error(`Pack odds reference ${rarity}, which PACK_ELIGIBLE_RARITIES excludes — see its comment.`);
    }
  }
}

/**
 * Cosmetic foil roll (spec.md Section 14's "editions... can differ in...
 * foiling", Section 12's gameplay/collectible-identity split) — orthogonal to
 * rarity by design: any template, Common through Legendary, can come out
 * foil. A flat per-card chance, independent of the rarity roll above, so foil
 * doesn't compound with or dilute the rarity chase — it's a second, separate
 * thing to get excited about on a flip, closer to Pokémon's "shiny" than a
 * value multiplier on rarity. 8%/card ≈ 34% of 5-card packs contain at least
 * one foil. Same "first pass, not final" caveat as the odds above.
 */
const FOIL_CHANCE = 0.08;

function templatesByRarity(): Map<Rarity, string[]> {
  const map = new Map<Rarity, string[]>();
  for (const t of Object.values(CARD_POOL)) {
    if (t.token || !t.rarity || !PACK_ELIGIBLE_RARITIES.has(t.rarity)) continue;
    const list = map.get(t.rarity) ?? [];
    list.push(t.id);
    map.set(t.rarity, list);
  }
  return map;
}

function rollRarity(odds: RarityOdds, rng: () => number): Rarity {
  const roll = rng();
  let cumulative = 0;
  for (const [rarity, weight] of odds) {
    cumulative += weight;
    if (roll < cumulative) return rarity;
  }
  return odds[odds.length - 1][0];
}

/**
 * Pure card+foil roll, kept separate from openPack's DB/coin side so (seed,
 * packType) is independently testable and reproducible — same
 * determinism-by-construction story as the match engine (engine/src/rng.ts).
 */
export function rollPackCards(packType: string, seed: number): PackCard[] {
  const def = PACK_DEFINITIONS[packType];
  if (!def) throw new UnknownPackTypeError(`Unknown pack type: ${packType}`);

  const byRarity = templatesByRarity();
  const rng = mulberry32(seed);
  const cards: PackCard[] = [];

  for (let slot = 0; slot < def.cardCount; slot++) {
    const odds = slot === def.cardCount - 1 ? LAST_SLOT_ODDS : NORMAL_ODDS;
    let rarity = rollRarity(odds, rng);
    let pool = byRarity.get(rarity);
    if (!pool || pool.length === 0) {
      rarity = "Common";
      pool = byRarity.get(rarity) ?? [];
    }
    const templateId = pool[Math.floor(rng() * pool.length)];
    const isFoil = rng() < FOIL_CHANCE;
    cards.push({ templateId, isFoil });
  }
  return cards;
}

export interface PackOpenResult {
  cards: PackCard[];
  balance: number;
}

/**
 * Atomically: locks and checks the account's Coins balance, debits the pack
 * cost, rolls cards against a fresh random seed, grants those as new
 * standard-edition instances, and logs the roll to pack_openings — all in
 * one transaction, so a mid-way failure can never charge Coins without
 * granting cards or vice versa.
 */
export async function openPack(pool: Pool, accountId: string, packType: string): Promise<PackOpenResult> {
  const def = PACK_DEFINITIONS[packType];
  if (!def) throw new UnknownPackTypeError(`Unknown pack type: ${packType}`);

  const client = await pool.connect();
  try {
    await client.query("begin");

    const balanceRow = await client.query<{ coins_balance: number }>(
      "select coins_balance from accounts where id = $1 for update",
      [accountId],
    );
    const balance = balanceRow.rows[0]?.coins_balance ?? 0;
    if (balance < def.cost) throw new InsufficientCoinsError(`Need ${def.cost} Coins, have ${balance}.`);

    // Rolled after the balance is confirmed (and locked) but before it's spent — a seed generated per
    // attempt, not per success, would leak information about rejected rolls through timing/order.
    const seed = randomInt(0, 2 ** 31 - 1);
    const cards = rollPackCards(packType, seed);

    const balanceAfter = await applyCoinDeltaOnClient(client, accountId, -def.cost, `pack_open:${packType}`);
    await grantCardInstances(client, accountId, cards);
    await client.query(
      `insert into pack_openings (account_id, pack_type, coins_spent, cards, seed) values ($1, $2, $3, $4, $5)`,
      [accountId, packType, def.cost, JSON.stringify(cards), seed],
    );

    await client.query("commit");
    return { cards, balance: balanceAfter };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
