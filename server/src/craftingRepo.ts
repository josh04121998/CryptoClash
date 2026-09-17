import { CARD_POOL, CardTemplate, Faction, Rarity } from "@cryptoclash/engine";
import type { Pool } from "pg";
import { recordAchievementProgress } from "./achievementsRepo.js";
import { BASELINE_CONDITION_GRADE, grantCardInstances } from "./collectionRepo.js";
import { applyDustDeltaOnClient } from "./ledger.js";
import { withTransaction } from "./txHelper.js";

export class InsufficientDustError extends Error {}
export class InvalidTemplateError extends Error {}
export class InsufficientCopiesError extends Error {}

/**
 * Rarities the crafting system touches at all — Mythic/Genesis stay fully
 * excluded (crafting one on demand would be a backdoor around Genesis's
 * permanently-capped supply, spec.md Section 16). Common used to be excluded
 * outright too, back when grantStartingCollection re-topped every account up
 * to 3 copies of *every* faction's Commons on every sign-in (which would've
 * let a player farm Dust for free: disenchant → sign out → sign back in →
 * re-granted → disenchant again). Now that the starting grant only covers
 * one chosen faction's Commons plus Neutral's (STATUS.md roadmap item 1),
 * that free-farm risk only applies to *those* specific templates — see
 * isFreeStartingCommon below, checked per-account, not per-rarity.
 */
const CRAFT_ELIGIBLE_RARITIES: ReadonlySet<Rarity> = new Set(["Common", "Uncommon", "Rare", "Epic", "Legendary"]);

/**
 * A Common a given account gets re-granted for free forever, and therefore
 * can't disenchant (infinite-Dust farm) or craft (pointless — it's already
 * free): their own chosen starting faction's Commons, plus every Neutral
 * Common (granted regardless of faction — see collectionRepo.ts's
 * starterTemplateIds). A Common from any *other* faction is real duplicate-
 * protection material like any Uncommon+, since packs are the only way to
 * get it. `startingFaction` is null for an account that hasn't chosen one
 * yet (or signed in before this feature existed) — treated conservatively
 * as "every Common is still free," matching the old blanket-excluded
 * behavior, since we don't know which faction (if any) is exempt for them.
 */
function isFreeStartingCommon(template: CardTemplate, startingFaction: Faction | null): boolean {
  return template.faction === "Neutral" || startingFaction === null || template.faction === startingFaction;
}

/**
 * Dust values, anchored to Hearthstone's long-tested disenchant/craft economy
 * (Common 5/40, Rare 20/100, Epic 100/400, Legendary 400/1600 — the closest
 * real-world precedent for exactly this problem), with an Uncommon tier
 * interpolated between Common and Rare since that ladder doesn't have one.
 * The ~4-7x craft:disenchant ratio is deliberate, not just copied: without
 * it, disenchanting an unwanted card and re-crafting that exact card back
 * would be free, which would make "duplicates have value" (spec.md Section
 * 18) trivially gameable. First design pass, not tuned against real play
 * data — same caveat as packsRepo.ts's odds.
 */
const DISENCHANT_VALUE: Partial<Record<Rarity, number>> = {
  Common: 5,
  Uncommon: 10,
  Rare: 20,
  Epic: 100,
  Legendary: 400,
};
const CRAFT_COST: Partial<Record<Rarity, number>> = {
  Common: 40,
  Uncommon: 70,
  Rare: 100,
  Epic: 400,
  Legendary: 1600,
};

for (const rarity of CRAFT_ELIGIBLE_RARITIES) {
  if (DISENCHANT_VALUE[rarity] === undefined || CRAFT_COST[rarity] === undefined) {
    throw new Error(`Missing Dust value for craft-eligible rarity ${rarity} — see DISENCHANT_VALUE/CRAFT_COST.`);
  }
}

export interface CraftRate {
  rarity: Rarity;
  disenchantValue: number;
  craftCost: number;
}

/**
 * Pure, no-DB — the Dust economics, for the client to render costs/values
 * without hardcoding a second copy of DISENCHANT_VALUE/CRAFT_COST (same
 * reasoning PACK_DEFINITIONS is served over GET /api/packs rather than
 * duplicated client-side).
 */
export function getCraftRates(): CraftRate[] {
  return [...CRAFT_ELIGIBLE_RARITIES].map((rarity) => ({
    rarity,
    disenchantValue: DISENCHANT_VALUE[rarity]!,
    craftCost: CRAFT_COST[rarity]!,
  }));
}

/** `startingFaction` is the account's own — the caller reads it from the same locked accounts row it already selects, so this never needs its own query. */
function craftableTemplate(templateId: string, startingFaction: Faction | null): CardTemplate {
  const template = CARD_POOL[templateId];
  if (!template || template.token || !template.rarity || !CRAFT_ELIGIBLE_RARITIES.has(template.rarity)) {
    throw new InvalidTemplateError(`${templateId} isn't a craftable/disenchantable template.`);
  }
  if (template.rarity === "Common" && isFreeStartingCommon(template, startingFaction)) {
    throw new InvalidTemplateError(`${template.name} is part of your free starting set and can't be crafted or disenchanted.`);
  }
  return template;
}

export async function getDustBalance(pool: Pool, accountId: string): Promise<number> {
  const result = await pool.query<{ dust_balance: number }>("select dust_balance from accounts where id = $1", [accountId]);
  return result.rows[0]?.dust_balance ?? 0;
}

export interface DisenchantResult {
  dustEarned: number;
  balance: number;
}

/**
 * Disenchants `count` owned copies of `templateId`, crediting Dust at that
 * rarity's DISENCHANT_VALUE per copy. Standard-edition, non-foil instances
 * are removed first (an ORDER BY, not a separate API) so a player's foil
 * pulls — and any future Full Art/Ultra/Secret edition (collectibility.md
 * Section 4) or First Edition instance (Section 10), nothing grants those
 * yet but nothing should have to change here when something does — survive
 * a bulk disenchant of the rest by default, without needing per-instance
 * selection in v1. Locks the account row before reading owned
 * instances — same serialize-via-accounts-row-lock pattern as
 * packsRepo.ts's openPack — so two concurrent disenchant/craft calls on the
 * same account can't race past each other and double-spend the same
 * physical card_instances rows.
 */
export async function disenchantCards(pool: Pool, accountId: string, templateId: string, count: number): Promise<DisenchantResult> {
  if (count <= 0) throw new Error("count must be positive.");

  return withTransaction(pool, async (client) => {
    const accountRow = await client.query<{ starting_faction: Faction | null }>(
      "select starting_faction from accounts where id = $1 for update",
      [accountId],
    );
    const template = craftableTemplate(templateId, accountRow.rows[0]?.starting_faction ?? null);

    const instanceRows = await client.query<{ id: string }>(
      `select ci.id
       from card_instances ci
       join card_editions ce on ce.id = ci.edition_id
       where ci.owner_id = $1 and ce.template_id = $2
       order by (ce.edition_type <> 'standard') asc, ci.is_foil asc, ci.acquired_at asc
       limit $3`,
      [accountId, templateId, count],
    );
    if (instanceRows.rows.length < count) {
      throw new InsufficientCopiesError(`You own ${instanceRows.rows.length} copies of ${template.name}, tried to disenchant ${count}.`);
    }

    await client.query(
      `delete from card_instances where id = any($1::uuid[])`,
      [instanceRows.rows.map((r) => r.id)],
    );

    const dustEarned = DISENCHANT_VALUE[template.rarity!]! * count;
    const balance = await applyDustDeltaOnClient(client, accountId, dustEarned, `disenchant:${templateId}`);

    return { dustEarned, balance };
  });
}

export interface CraftResult {
  balance: number;
}

/**
 * Spends Dust to craft one new standard-edition instance of `templateId`.
 * Crafted cards are never foil — foil stays a pack-exclusive surprise
 * (packsRepo.ts), not something Dust can buy.
 */
export async function craftCard(pool: Pool, accountId: string, templateId: string): Promise<CraftResult> {
  return withTransaction(pool, async (client) => {
    const balanceRow = await client.query<{ dust_balance: number; starting_faction: Faction | null }>(
      "select dust_balance, starting_faction from accounts where id = $1 for update",
      [accountId],
    );
    const template = craftableTemplate(templateId, balanceRow.rows[0]?.starting_faction ?? null);
    const cost = CRAFT_COST[template.rarity!]!;
    const balance = balanceRow.rows[0]?.dust_balance ?? 0;
    if (balance < cost) throw new InsufficientDustError(`Need ${cost} Dust, have ${balance}.`);

    const balanceAfter = await applyDustDeltaOnClient(client, accountId, -cost, `craft:${templateId}`);
    // Fixed Condition grade, not a roll — crafting is already deterministic/non-foil by
    // design (you pick exactly which card you get), so a random grade would be the odd
    // one out among its guarantees. Same baseline Starter Decks use.
    await grantCardInstances(client, accountId, [{ templateId, isFoil: false, conditionGrade: BASELINE_CONDITION_GRADE }]);
    // "Craft your first Legendary" achievement — hooked right at the real event, same reasoning
    // packsRepo.ts's rollGrantAndLog tracks "pack_opened_total" at its own real event.
    if (template.rarity === "Legendary") await recordAchievementProgress(client, accountId, "craft_legendary", 1);

    return { balance: balanceAfter };
  });
}
