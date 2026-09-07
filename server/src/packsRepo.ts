import { CARD_POOL, mulberry32, Rarity } from "@cryptoclash/engine";
import { randomInt } from "node:crypto";
import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./coinsRepo.js";
import { grantCardInstances } from "./collectionRepo.js";

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
 * Placeholder pack odds — spec.md Section 17 asks for "rarity chances" and a
 * "guaranteed baseline value" but gives no numbers, so these are a first
 * pass, not tuned economy design (same caveat as cards.ts's rarity
 * heuristic). Every slot rolls NORMAL_ODDS except the last, which rolls the
 * richer LAST_SLOT_ODDS so every pack guarantees at least one Uncommon+.
 * Mythic/Genesis aren't listed because no CARD_POOL template uses them yet —
 * add them here once some do.
 */
const NORMAL_ODDS: RarityOdds = [
  ["Common", 0.6],
  ["Uncommon", 0.25],
  ["Rare", 0.1],
  ["Epic", 0.04],
  ["Legendary", 0.01],
];
const LAST_SLOT_ODDS: RarityOdds = [
  ["Uncommon", 0.55],
  ["Rare", 0.3],
  ["Epic", 0.12],
  ["Legendary", 0.03],
];

function templatesByRarity(): Map<Rarity, string[]> {
  const map = new Map<Rarity, string[]>();
  for (const t of Object.values(CARD_POOL)) {
    if (t.token || !t.rarity) continue;
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
 * Pure card roll, kept separate from openPack's DB/coin side so (seed,
 * packType) is independently testable and reproducible — same
 * determinism-by-construction story as the match engine (engine/src/rng.ts).
 */
export function rollPackCards(packType: string, seed: number): string[] {
  const def = PACK_DEFINITIONS[packType];
  if (!def) throw new UnknownPackTypeError(`Unknown pack type: ${packType}`);

  const byRarity = templatesByRarity();
  const rng = mulberry32(seed);
  const cards: string[] = [];

  for (let slot = 0; slot < def.cardCount; slot++) {
    const odds = slot === def.cardCount - 1 ? LAST_SLOT_ODDS : NORMAL_ODDS;
    let rarity = rollRarity(odds, rng);
    let pool = byRarity.get(rarity);
    if (!pool || pool.length === 0) {
      rarity = "Common";
      pool = byRarity.get(rarity) ?? [];
    }
    cards.push(pool[Math.floor(rng() * pool.length)]);
  }
  return cards;
}

export interface PackOpenResult {
  cards: string[];
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
