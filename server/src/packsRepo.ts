import { CARD_POOL, mulberry32, Rarity } from "@cryptoclash/engine";
import { randomInt } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { recordAchievementProgress } from "./achievementsRepo.js";
import { applyCoinDeltaOnClient } from "./coinsRepo.js";
import { grantCardInstances, PackCard } from "./collectionRepo.js";
import { withTransaction } from "./txHelper.js";

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
 * Retuned 2026-09-10 (session 20), second pass — the first pass this same
 * session (flat "1-in-1000-or-more" on Legendary) was an arbitrary round
 * number, not a legitimate target; the user asked for a real pass anchored
 * to actual Pokémon TCG pull-rate data instead. Pulled real, sourced,
 * community-measured numbers (Pokémon never publishes official odds) from
 * Scarlet & Violet-era booster data (1,728-pack sample): Illustration Rare
 * 7.52% per pack (~1-in-13), Special Illustration Rare 3.01% (~1-in-33),
 * Hyper Rare (the true chase/"secret rare" tier) 1.85% (~1-in-54) — and,
 * crucially, that these are "any card of this tier" rates; a *specific*
 * SIR is ~1-in-318 and a specific Hyper Rare ~1-in-324, because ~10-12 real
 * cards split that tier's odds. That specific/tier split is exactly what
 * "1 in 1000" flattened away.
 *
 * Mapped onto this game's 5 pack-eligible tiers (Mythic/Genesis stay
 * non-pack — spec.md Section 17): Epic is this game's Illustration-Rare
 * analog (the "real, exciting pull" tier), Legendary is the Hyper-Rare
 * analog (the true grail tier). Rare/Uncommon/Common are barely touched
 * from the first design pass (2026-09-07) — Pokémon's own Rare-tier odds
 * are already generous (guaranteed-ish per pack), which matches this game's
 * existing "guaranteed Uncommon+ last slot" baseline-value mechanic, so
 * there was no real precedent-driven reason to tighten them.
 *
 * Every slot but the last rolls NORMAL_ODDS; the last rolls the richer
 * LAST_SLOT_ODDS so every pack still guarantees at least one Uncommon+.
 * Blended across all 5 slots, against today's pool (17 Common / 23 Uncommon
 * / 14 Rare / 6 Epic / 11 Legendary — see cards.ts):
 *   Epic:      4×0.010  + 0.045 = 0.085 expected/pack  (~8.5%,  ~1-in-11.8 packs any;  ~1-in-70  packs for one specific of the 6)
 *   Legendary: 4×0.0005 + 0.016 = 0.018 expected/pack  (~1.8%,  ~1-in-55.6 packs any;  ~1-in-611 packs for one specific of the 11)
 * Both land within the same order of magnitude as their real Pokémon
 * analog's "any card of this tier" *and* "one specific card" numbers —
 * legitimate, not round-number theater. Still a first real design pass to
 * revisit against actual play telemetry before launch (same caveat as
 * cards.ts's rarity heuristic) — but now a defensible one.
 */
const NORMAL_ODDS: RarityOdds = [
  ["Common", 0.65],
  ["Uncommon", 0.2645],
  ["Rare", 0.075],
  ["Epic", 0.01],
  ["Legendary", 0.0005],
];
const LAST_SLOT_ODDS: RarityOdds = [
  ["Uncommon", 0.609],
  ["Rare", 0.33],
  ["Epic", 0.045],
  ["Legendary", 0.016],
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
 * Rolls a fresh seed, grants the resulting cards, and logs the roll to
 * pack_openings — the shared middle step between a paid open (openPack,
 * coinsSpent = the pack's cost) and a free grant (referralsRepo's viral-invite
 * rewards, coinsSpent = 0 — a real audit-log row, not a special case, so a
 * free pack is just as reproducible/auditable as a paid one). Takes a
 * `PoolClient` so callers compose it into their own transaction. Also advances the
 * "pack_opened_total" achievement (achievementsRepo.ts) by one per call — this is the one shared
 * path both a paid open and a free grant (referralsRepo.ts's viral-invite rewards) go through,
 * so hooking it here covers both without a second tracking call site.
 */
export async function rollGrantAndLog(client: PoolClient, accountId: string, packType: string, coinsSpent: number): Promise<PackCard[]> {
  const def = PACK_DEFINITIONS[packType];
  if (!def) throw new UnknownPackTypeError(`Unknown pack type: ${packType}`);

  const seed = randomInt(0, 2 ** 31 - 1);
  const cards = rollPackCards(packType, seed);
  await grantCardInstances(client, accountId, cards);
  await client.query(
    `insert into pack_openings (account_id, pack_type, coins_spent, cards, seed) values ($1, $2, $3, $4, $5)`,
    [accountId, packType, coinsSpent, JSON.stringify(cards), seed],
  );
  await recordAchievementProgress(client, accountId, "pack_opened_total", 1);
  return cards;
}

/**
 * Atomically: locks and checks the account's Coins balance, debits the pack
 * cost, then rolls/grants/logs via rollGrantAndLog — all in one transaction,
 * so a mid-way failure can never charge Coins without granting cards or vice
 * versa.
 */
export async function openPack(pool: Pool, accountId: string, packType: string): Promise<PackOpenResult> {
  const def = PACK_DEFINITIONS[packType];
  if (!def) throw new UnknownPackTypeError(`Unknown pack type: ${packType}`);

  return withTransaction(pool, async (client) => {
    const balanceRow = await client.query<{ coins_balance: number }>(
      "select coins_balance from accounts where id = $1 for update",
      [accountId],
    );
    const balance = balanceRow.rows[0]?.coins_balance ?? 0;
    if (balance < def.cost) throw new InsufficientCoinsError(`Need ${def.cost} Coins, have ${balance}.`);

    const balanceAfter = await applyCoinDeltaOnClient(client, accountId, -def.cost, `pack_open:${packType}`);
    // Debited before rolling — a seed generated per attempt, not per success, would leak
    // information about rejected rolls through timing/order.
    const cards = await rollGrantAndLog(client, accountId, packType, def.cost);

    return { cards, balance: balanceAfter };
  });
}
