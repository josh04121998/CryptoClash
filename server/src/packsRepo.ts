import { CARD_POOL, mulberry32, Rarity } from "@cryptoclash/engine";
import { randomInt } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { recordAchievementProgress } from "./achievementsRepo.js";
import { getStoreClient } from "./chain.js";
import { applyCoinDeltaOnClient } from "./coinsRepo.js";
import { grantCardInstances, grantSpecialEditionInstance, PackCard, SpecialEditionCard } from "./collectionRepo.js";
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
 * Session 40 — replaces the old separate, guaranteed-$7.99 "Founders Set" product (collectibility.md
 * §13 item 5's original build drifted from its own resolved design, which called for "random pull,
 * reusing the existing pack mechanism" — this closes that gap). Full Art/Ultra/Secret are no longer
 * something you buy directly; they're a rare secondary roll layered on top of an ordinary pack's own
 * Legendary roll, same way a real TCG's alt-art/secret-rare chase sits on top of its Rarity curve.
 *
 * Only fires when a slot's Rarity roll (NORMAL_ODDS/LAST_SLOT_ODDS above) comes up Legendary — every
 * one of the game's 11 Legendary templates already has a real Full Art illustration
 * (full-art-prompts.md), so this never needs an art-readiness guard the way a wider pool would.
 * ~90% of Legendary pulls stay plain Standard art; the remaining ~10% splits toward Full Art, same
 * 70/25/5 relative shape the old Founders Set's EDITION_ODDS already used for "given a special
 * pull, which tier." Compounded with Legendary's own ~1.8% expected/pack (packsRepo.ts's own NORMAL_
 * /LAST_SLOT_ODDS comment), a Secret pull lands around 1-in-11,000 packs for any of the 11 — the
 * genuine grail tier collectibility.md §8's "~5 in the world" math was written to describe. First
 * pass, not tuned against real data, same caveat as every other number in this file.
 */
const SPECIAL_EDITION_ODDS: [Exclude<PackCard["editionType"], "standard" | undefined>, number][] = [
  ["full_art", 0.07],
  ["ultra", 0.025],
  ["secret", 0.005],
];

function rollEditionType(rarity: Rarity, rng: () => number): PackCard["editionType"] {
  if (rarity !== "Legendary") return "standard";
  const roll = rng();
  let cumulative = 0;
  for (const [edition, weight] of SPECIAL_EDITION_ODDS) {
    cumulative += weight;
    if (roll < cumulative) return edition;
  }
  return "standard";
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

/**
 * Condition (Floor Grade) roll — collectibility.md Section 7's CS:GO-wear-
 * style quality axis, independent of Rarity/Edition/Foil by the same
 * reasoning as FOIL_CHANCE above: a Common can roll Blue Chip, a Legendary
 * can roll Distressed. Weights are the doc's own illustrative first-pass
 * distribution (skewed toward the middle with a thin top tail, matching how
 * real PSA population data looks), indexed 1 (Distressed) through 10 (Blue
 * Chip) to mirror rollRarity's worst-to-best ordering. Rolled once, at mint
 * — never re-rolled (Section 7: "no re-grade, permanent, provable fact").
 */
const CONDITION_WEIGHTS: [number, number][] = [
  [1, 0.02],
  [2, 0.04],
  [3, 0.08],
  [4, 0.12],
  [5, 0.16],
  [6, 0.2],
  [7, 0.18],
  [8, 0.12],
  [9, 0.06],
  [10, 0.02],
];

function rollCondition(rng: () => number): number {
  const roll = rng();
  let cumulative = 0;
  for (const [grade, weight] of CONDITION_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return grade;
  }
  return CONDITION_WEIGHTS[CONDITION_WEIGHTS.length - 1][0];
}

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
    const conditionGrade = rollCondition(rng);
    const editionType = rollEditionType(rarity, rng);
    cards.push({ templateId, isFoil, conditionGrade, editionType });
  }
  return cards;
}

export interface PackOpenResult {
  cards: (PackCard & { serialNumber?: number })[];
  balance: number;
}

/**
 * Rolls a fresh seed, grants the resulting cards, and logs the roll to
 * pack_openings — the shared middle step between a Coins-paid open (openPack,
 * coinsSpent = the pack's cost, usdgPaid = undefined), a real-money open
 * (confirmPackPurchase, coinsSpent = 0, usdgPaid = the on-chain amount actually paid), and a free
 * grant (referralsRepo's viral-invite rewards, both 0/undefined — a real audit-log row, not a
 * special case, so a free pack is just as reproducible/auditable as a paid one). Takes a
 * `PoolClient` so callers compose it into their own transaction. Also advances the
 * "pack_opened_total" achievement (achievementsRepo.ts) by one per call — this is the one shared
 * path every grant path goes through, so hooking it here covers all of them without a second
 * tracking call site.
 *
 * Grants in two groups, not one bulk call: the overwhelming majority of a roll is Standard-edition
 * (grantCardInstances' cheap bulk unnest()), but any card this roll upgraded to a special edition
 * (rollEditionType above, session 40) needs its own serial number and so goes through
 * grantSpecialEditionInstance one at a time instead — see collectionRepo.ts's own doc comments on
 * both for why they can't share a code path. Almost always zero special cards per pack; the loop
 * is simply skipped in that case. The returned array attaches each special card's real
 * serialNumber (standard cards never get one) so the client can show "#N" on a genuine chase pull,
 * the same reveal detail the old Founders Set screen always showed.
 */
export async function rollGrantAndLog(
  client: PoolClient,
  accountId: string,
  packType: string,
  coinsSpent: number,
  realMoney?: { usdgPaid: string; intentId: string },
): Promise<(PackCard & { serialNumber?: number })[]> {
  const def = PACK_DEFINITIONS[packType];
  if (!def) throw new UnknownPackTypeError(`Unknown pack type: ${packType}`);

  const seed = randomInt(0, 2 ** 31 - 1);
  const cards = rollPackCards(packType, seed);

  const standardCards: PackCard[] = [];
  const result: (PackCard & { serialNumber?: number })[] = [];
  for (const card of cards) {
    if (card.editionType && card.editionType !== "standard") {
      const { serialNumber } = await grantSpecialEditionInstance(client, accountId, card as PackCard & SpecialEditionCard);
      result.push({ ...card, serialNumber });
    } else {
      standardCards.push(card);
      result.push(card);
    }
  }
  await grantCardInstances(client, accountId, standardCards);

  await client.query(
    `insert into pack_openings (account_id, pack_type, coins_spent, cards, seed, usdg_paid, intent_id) values ($1, $2, $3, $4, $5, $6, $7)`,
    [accountId, packType, coinsSpent, JSON.stringify(result), seed, realMoney?.usdgPaid ?? null, realMoney?.intentId ?? null],
  );
  await recordAchievementProgress(client, accountId, "pack_opened_total", 1);
  return result;
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

export class PurchaseNotConfiguredError extends Error {}
export class PurchaseNotFoundError extends Error {}
export class PurchaseAlreadyGrantedError extends Error {}

/**
 * The real-money path onto the exact same "standard" pack `openPack` above sells for Coins —
 * session 40 replaced the old separate, guaranteed-$7.99 Founders Set product with this: $7.99
 * (FloorwarsStore.sol's `price`) buys the identical pack a player could also earn with Coins, odds
 * and all, just through a different payment rail. Reuses `FloorwarsStore.sol` exactly as already
 * deployed to testnet — its `purchaseFoundersSet` function is now spent on packs instead, a
 * cosmetic on-chain naming wart worth a clean rename+redeploy later but harmless today (nothing
 * about the contract's actual behavior — pull `price` in `paymentToken`, record an `intentId`,
 * emit `Purchase` — was ever specific to the old product; zero real purchases ever happened under
 * the old name per production telemetry, so there's no real-money history being reinterpreted).
 *
 * This never submits a transaction itself — the player's own wallet calls the contract directly
 * (see FloorwarsStore.sol's own doc comment for why). All this does is read `StoreClient.
 * verifyPurchase` to confirm `intentId` was really paid by `walletAddress`, then roll/grant/log
 * exactly like a Coins-paid open.
 *
 * The `pack_purchases` row (migration 0017, renamed from founders_set_purchases) inserted via `on
 * conflict do nothing` is the idempotency guard for *this* function specifically — the contract's
 * own on-chain `purchased` mapping already stops the same intentId being paid twice, but does
 * nothing to stop this confirm endpoint being called twice for one real payment (a retry, a
 * duplicate request), which would otherwise double-grant a pack for a single purchase. Same
 * "claim via an atomic insert before doing the real work" shape as mintingRepo.ts's mintInstance.
 */
export async function confirmPackPurchase(pool: Pool, accountId: string, walletAddress: string, intentId: string): Promise<PackOpenResult> {
  const store = getStoreClient();
  if (!store) throw new PurchaseNotConfiguredError("Real-money pack purchases aren't configured on this server.");

  const purchase = await store.verifyPurchase(intentId, walletAddress);
  if (!purchase) throw new PurchaseNotFoundError("No matching on-chain purchase found for this intent.");

  return withTransaction(pool, async (client) => {
    const claim = await client.query<{ intent_id: string }>(
      `insert into pack_purchases (intent_id, account_id, amount_paid)
       values ($1, $2, $3)
       on conflict (intent_id) do nothing
       returning intent_id`,
      [intentId, accountId, purchase.amount.toString()],
    );
    if (claim.rows.length === 0) {
      throw new PurchaseAlreadyGrantedError("This purchase has already been granted.");
    }

    const amountStr = purchase.amount.toString();
    const cards = await rollGrantAndLog(client, accountId, "standard", 0, { usdgPaid: amountStr, intentId });

    const balanceRow = await client.query<{ coins_balance: number }>("select coins_balance from accounts where id = $1", [accountId]);
    return { cards, balance: balanceRow.rows[0]?.coins_balance ?? 0 };
  });
}
