import { mulberry32 } from "@cryptoclash/engine";
import { randomInt } from "node:crypto";
import type { Pool } from "pg";
import { getStoreClient } from "./chain.js";
import { FoundersSetCard, grantFoundersSetInstance } from "./collectionRepo.js";
import { withTransaction } from "./txHelper.js";

/**
 * v1 Founders Set template pool — the 11 Legendary creatures `full-art-prompts.md` prepared real
 * Full Art illustration prompts for. `collectibility.md` §8 allows a Founders Set to reprint any
 * Rarity, but rolling a template with no Full Art image yet would have nothing for the (not yet
 * built) render pipeline to composite — same class of problem `mintingRepo.ts`'s ArtNotReadyError
 * guards against for Standard art. Not a permanent restriction — expand once more Full Art exists.
 */
const FOUNDERS_SET_TEMPLATE_POOL: readonly string[] = [
  "loyal_hound",
  "alpha_dog",
  "deep_croak",
  "primordial_croak",
  "full_stack_grizzly",
  "unicorn_ursa",
  "moon_ape",
  "exit_silverback",
  "compound_brahman",
  "unicorn_bull",
  "steadfast_tabby",
];

/** Fewer cards than a Standard Pack's 5 — reflects the much higher per-card rarity/price of a Founders Set. First-pass choice, not tuned against anything real, same caveat as every other economy number in this codebase. */
export const FOUNDERS_SET_CARD_COUNT = 3;

/**
 * Edition-tier distribution within one Founders Set pull. Full Art most common, Secret the true
 * chase tier — mirrors real TCG Secret Rare scarcity (Pokémon's own Hyper Rare sits at roughly
 * this order of magnitude below its Illustration Rare tier, per the sourced numbers
 * `packsRepo.ts`'s own odds comment already cites). First-pass placeholder, not tuned against
 * real data — same caveat as `packsRepo.ts`'s NORMAL_ODDS.
 */
const EDITION_ODDS: [FoundersSetCard["editionType"], number][] = [
  ["full_art", 0.7],
  ["ultra", 0.25],
  ["secret", 0.05],
];

/** Same rate as a Standard Pack (`packsRepo.ts`'s FOIL_CHANCE) — Foil is independent of Edition by design (collectibility.md §5: "Foil rolls independently on every Edition tier, including Secret — no exceptions"). */
const FOIL_CHANCE = 0.08;

/** Identical table to `packsRepo.ts`'s CONDITION_WEIGHTS — Condition is independent of source (collectibility.md §7), a Founders Set pull rolls it the same way a paid Standard Pack does. */
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

function rollEditionType(rng: () => number): FoundersSetCard["editionType"] {
  const roll = rng();
  let cumulative = 0;
  for (const [edition, weight] of EDITION_ODDS) {
    cumulative += weight;
    if (roll < cumulative) return edition;
  }
  return EDITION_ODDS[EDITION_ODDS.length - 1][0];
}

/** Pure roll, independently testable — same determinism-by-construction pattern as `packsRepo.ts`'s rollPackCards. */
export function rollFoundersSetCards(seed: number): FoundersSetCard[] {
  const rng = mulberry32(seed);
  const cards: FoundersSetCard[] = [];
  for (let i = 0; i < FOUNDERS_SET_CARD_COUNT; i++) {
    const templateId = FOUNDERS_SET_TEMPLATE_POOL[Math.floor(rng() * FOUNDERS_SET_TEMPLATE_POOL.length)];
    const editionType = rollEditionType(rng);
    const isFoil = rng() < FOIL_CHANCE;
    const conditionGrade = rollCondition(rng);
    cards.push({ templateId, editionType, isFoil, conditionGrade });
  }
  return cards;
}

export class PurchaseNotConfiguredError extends Error {}
export class PurchaseNotFoundError extends Error {}
export class PurchaseAlreadyGrantedError extends Error {}

export interface FoundersSetConfirmResult {
  cards: (FoundersSetCard & { instanceId: string; serialNumber: number })[];
}

/**
 * Confirms a Founders Set purchase actually happened on-chain, then rolls and grants its cards
 * exactly once per intentId.
 *
 * This never submits a transaction itself — the player's own wallet calls
 * `FloorwarsStore.purchaseFoundersSet` directly (see `web3/contracts/FloorwarsStore.sol`'s own
 * doc comment for why that's a deliberately better design than a raw transfer this backend would
 * have to fuzzy-match). All this function does is read `StoreClient.verifyPurchase` to confirm
 * `intentId` was really paid by `walletAddress`, then grant.
 *
 * The `founders_set_purchases` row (migration `0016`) inserted via `on conflict do nothing` is
 * the idempotency guard for *this* function specifically — the contract's own on-chain
 * `purchased` mapping already stops the same intentId being paid twice, but does nothing to stop
 * this confirm endpoint being called twice for one real payment (a retry, a duplicate request),
 * which would otherwise double-grant cards for a single purchase. Same "claim via an atomic
 * insert/update before doing the real work" shape as `mintingRepo.ts`'s mintInstance.
 */
export async function confirmFoundersSetPurchase(
  pool: Pool,
  accountId: string,
  walletAddress: string,
  intentId: string,
): Promise<FoundersSetConfirmResult> {
  const store = getStoreClient();
  if (!store) throw new PurchaseNotConfiguredError("Founders Set purchases aren't configured on this server.");

  const purchase = await store.verifyPurchase(intentId, walletAddress);
  if (!purchase) throw new PurchaseNotFoundError("No matching on-chain purchase found for this intent.");

  return withTransaction(pool, async (client) => {
    const claim = await client.query<{ intent_id: string }>(
      `insert into founders_set_purchases (intent_id, account_id, amount_paid)
       values ($1, $2, $3)
       on conflict (intent_id) do nothing
       returning intent_id`,
      [intentId, accountId, purchase.amount.toString()],
    );
    if (claim.rows.length === 0) {
      throw new PurchaseAlreadyGrantedError("This purchase has already been granted.");
    }

    const seed = randomInt(0, 2 ** 31 - 1);
    const rolled = rollFoundersSetCards(seed);
    const granted: FoundersSetConfirmResult["cards"] = [];
    for (const card of rolled) {
      const { instanceId, serialNumber } = await grantFoundersSetInstance(client, accountId, card);
      granted.push({ ...card, instanceId, serialNumber });
    }

    await client.query(`update founders_set_purchases set seed = $2, cards = $3 where intent_id = $1`, [
      intentId,
      seed,
      JSON.stringify(rolled),
    ]);

    return { cards: granted };
  });
}
