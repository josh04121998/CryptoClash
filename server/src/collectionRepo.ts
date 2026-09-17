import { CARD_POOL, Faction, MAX_COPIES_PER_CARD } from "@cryptoclash/engine";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "./txHelper.js";

/** The six real factions a player can pick as their free starting set — Neutral isn't choosable (see starterTemplateIds). */
export const STARTING_FACTIONS: readonly Faction[] = ["Doggos", "Frogs", "Degens", "CryptoBros", "Builders", "Normies"];

export class InvalidFactionError extends Error {}
export class StartingFactionAlreadySetError extends Error {}

/**
 * Common-rarity, non-token templates for one chosen faction, plus every
 * Neutral Common (faction-agnostic staples like Sharpening Stone/Rocket
 * Boots — granted regardless of which faction is chosen, same as how
 * Neutral Items already show up in every faction's own sample deck).
 * Recomputed from CARD_POOL each call, not cached, so a newly-added Common
 * template shows up automatically without a code change here.
 */
function starterTemplateIds(faction: Faction): string[] {
  return Object.values(CARD_POOL)
    .filter((t) => !t.token && t.rarity === "Common" && (t.faction === faction || t.faction === "Neutral"))
    .map((t) => t.id);
}

/**
 * Grants an account MAX_COPIES_PER_CARD standard-edition instances of their
 * chosen faction's Commons plus every Neutral Common — a real "must be
 * earned, like Hearthstone" baseline (STATUS.md roadmap item 1) rather than
 * every faction's Commons handed over for free forever (the original
 * session-4 design, which in turn replaced session 3's "the entire pool" —
 * see the git history on this function for that lineage). Idempotent and
 * safe to call on every sign-in: only tops up what's missing, so it also
 * back-fills any Common template added to the pool after an account's first
 * sign-in. Deliberately doesn't enforce "faction already chosen" itself —
 * that's setStartingFaction's job; this is the reusable grant primitive both
 * setStartingFaction (first choice) and the sign-in top-up path (repeat
 * visits) call.
 *
 * Builders and Degens used to have only one Common template each (Junior
 * Dev, Degen Ape) vs. 3-4 for every other faction — fixed by adding two more
 * Commons per faction (Code Monkey/Ship It, Overleveraged/Slow Burn), so
 * every faction now grants 3+ unique Commons plus the 2 Neutral ones.
 *
 * Three queries regardless of pool size — bulk upsert editions, bulk-read
 * current counts, bulk-insert the shortfall — rather than one round-trip per
 * template, since this runs on every sign-in, not just account creation.
 */
export async function grantStartingCollection(pool: Pool, accountId: string, faction: Faction): Promise<void> {
  const templateIds = starterTemplateIds(faction);
  if (templateIds.length === 0) return;

  await withTransaction(pool, (client) => grantStartingCollectionWithClient(client, accountId, templateIds));
}

async function grantStartingCollectionWithClient(client: PoolClient, accountId: string, templateIds: string[]): Promise<void> {
  const editionRows = await client.query<{ id: string }>(
    `insert into card_editions (template_id, edition_type)
     select unnest($1::text[]), 'standard'
     on conflict (template_id, edition_type) do update set template_id = excluded.template_id
     returning id`,
    [templateIds],
  );
  const editionIds = editionRows.rows.map((r) => r.id);

  const countRows = await client.query<{ edition_id: string; count: string }>(
    `select edition_id, count(*)::int as count
     from card_instances
     where owner_id = $1 and edition_id = any($2::uuid[])
     group by edition_id`,
    [accountId, editionIds],
  );
  const ownedByEdition = new Map(countRows.rows.map((r) => [r.edition_id, Number(r.count)]));

  const toInsert: string[] = [];
  for (const editionId of editionIds) {
    const owned = ownedByEdition.get(editionId) ?? 0;
    for (let i = owned; i < MAX_COPIES_PER_CARD; i++) toInsert.push(editionId);
  }

  if (toInsert.length > 0) {
    await client.query(
      `insert into card_instances (owner_id, edition_id) select $1, unnest($2::uuid[])`,
      [accountId, toInsert],
    );
  }
}

/** Null means the account hasn't chosen a starting faction yet (a brand-new account, or one that signed in before this feature existed). */
export async function getStartingFaction(db: Pool | PoolClient, accountId: string): Promise<Faction | null> {
  const result = await db.query<{ starting_faction: Faction | null }>(
    `select starting_faction from accounts where id = $1`,
    [accountId],
  );
  return result.rows[0]?.starting_faction ?? null;
}

/**
 * The one-time choice: locks in `faction` as this account's free starting
 * set and immediately grants it. Deliberately a one-shot, not a re-pickable
 * setting — 409s if the account already has one, so "must be earned" can't
 * be sidestepped by re-rolling faction to farm a second free Common set.
 */
export async function setStartingFaction(pool: Pool, accountId: string, faction: Faction): Promise<void> {
  if (!STARTING_FACTIONS.includes(faction)) {
    throw new InvalidFactionError(`"${faction}" isn't a choosable starting faction.`);
  }
  await withTransaction(pool, async (client) => {
    const existing = await client.query<{ starting_faction: Faction | null }>(
      `select starting_faction from accounts where id = $1 for update`,
      [accountId],
    );
    if (existing.rows[0]?.starting_faction) {
      throw new StartingFactionAlreadySetError("Starting faction is already chosen and can't be changed.");
    }
    await client.query(`update accounts set starting_faction = $2 where id = $1`, [accountId, faction]);
    await grantStartingCollectionWithClient(client, accountId, starterTemplateIds(faction));
  });
}

/** A single card grant: which template, and whether this copy rolled the pack's cosmetic foil chance. */
export interface PackCard {
  templateId: string;
  isFoil: boolean;
}

/**
 * Adds exactly the given cards as new standard-edition instances — unlike
 * grantStartingCollection's "top up to N", this always inserts one instance
 * per array entry, including duplicates: pulling the same Rare twice in one
 * pack, or a Common you're already capped on for deckbuilding, is still real
 * collection value (spec.md Section 18's duplicate-protection intent —
 * crafting resources, not yet built, is what eventually spends these). Takes
 * a `PoolClient`, not a `Pool`, so a caller with its own outer transaction
 * (packsRepo's coin-debit + instance-creation) can include this in it
 * atomically.
 */
export async function grantCardInstances(client: PoolClient, accountId: string, cards: PackCard[]): Promise<void> {
  if (cards.length === 0) return;
  const uniqueIds = [...new Set(cards.map((c) => c.templateId))];

  const editionRows = await client.query<{ id: string; template_id: string }>(
    `insert into card_editions (template_id, edition_type)
     select unnest($1::text[]), 'standard'
     on conflict (template_id, edition_type) do update set template_id = excluded.template_id
     returning id, template_id`,
    [uniqueIds],
  );
  const editionIdByTemplate = new Map(editionRows.rows.map((r) => [r.template_id, r.id]));
  const editionIds = cards.map((c) => editionIdByTemplate.get(c.templateId)!);
  const isFoils = cards.map((c) => c.isFoil);

  // Two unnest() calls in one SELECT list run in lockstep since Postgres 10 — zips
  // editionIds[i] with isFoils[i], not a cross join, as long as both arrays are the same length.
  await client.query(
    `insert into card_instances (owner_id, edition_id, is_foil) select $1, unnest($2::uuid[]), unnest($3::boolean[])`,
    [accountId, editionIds, isFoils],
  );
}

/** Owned copy count per template id, for the collection screen and deck-ownership gating. */
export async function getCollectionCounts(pool: Pool, accountId: string): Promise<Record<string, number>> {
  const result = await pool.query<{ template_id: string; count: string }>(
    `select ce.template_id as template_id, count(ci.id)::int as count
     from card_instances ci
     join card_editions ce on ce.id = ci.edition_id
     where ci.owner_id = $1
     group by ce.template_id`,
    [accountId],
  );
  const counts: Record<string, number> = {};
  for (const row of result.rows) counts[row.template_id] = Number(row.count);
  return counts;
}

/**
 * Owned copy counts *and* owned foil copy counts per template id, in one
 * query — the collection screen (spec.md Section 19) needs both together, and
 * a conditional aggregate (`count(...) filter (where ci.is_foil)`) gets them
 * from the same scan/join getCollectionCounts already does, rather than a
 * second DB round trip. Deliberately not folded into getCollectionCounts
 * itself: deck-ownership gating (validateOwnership below) only ever needs
 * plain owned counts, and must never care whether a copy is foil — that
 * function stays as-is so nothing there can accidentally start depending on
 * foil status.
 */
export async function getCollectionSummary(
  pool: Pool,
  accountId: string,
): Promise<{ owned: Record<string, number>; foils: Record<string, number> }> {
  const result = await pool.query<{ template_id: string; count: string; foil_count: string }>(
    `select ce.template_id as template_id,
            count(ci.id)::int as count,
            count(ci.id) filter (where ci.is_foil)::int as foil_count
     from card_instances ci
     join card_editions ce on ce.id = ci.edition_id
     where ci.owner_id = $1
     group by ce.template_id`,
    [accountId],
  );
  const owned: Record<string, number> = {};
  const foils: Record<string, number> = {};
  for (const row of result.rows) {
    owned[row.template_id] = Number(row.count);
    const foilCount = Number(row.foil_count);
    if (foilCount > 0) foils[row.template_id] = foilCount;
  }
  return { owned, foils };
}

/**
 * Checks a prospective deck against what the account actually owns — separate
 * from (and always run alongside) engine's validateDeck(), which only checks
 * pool-legality (unknown ids, tokens, the 3-copy cap, deck size). Returns
 * human-readable problems; empty means the account owns enough of everything.
 */
export async function validateOwnership(pool: Pool, accountId: string, cards: string[]): Promise<string[]> {
  const needed = new Map<string, number>();
  for (const id of cards) needed.set(id, (needed.get(id) ?? 0) + 1);

  const owned = await getCollectionCounts(pool, accountId);
  const errors: string[] = [];
  for (const [templateId, count] of needed) {
    const have = owned[templateId] ?? 0;
    if (count > have) {
      const name = CARD_POOL[templateId]?.name ?? templateId;
      errors.push(`${name}: you own ${have}, deck needs ${count}.`);
    }
  }
  return errors;
}
