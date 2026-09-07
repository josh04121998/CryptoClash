import { CARD_POOL, MAX_COPIES_PER_CARD } from "@cryptoclash/engine";
import type { Pool, PoolClient } from "pg";

/**
 * Every Common-rarity, non-token template id — the starter set. Recomputed
 * from CARD_POOL each call (not cached) so a newly-added Common template
 * shows up automatically without a code change here.
 */
function starterTemplateIds(): string[] {
  return Object.values(CARD_POOL)
    .filter((t) => !t.token && t.rarity === "Common")
    .map((t) => t.id);
}

/**
 * Grants an account MAX_COPIES_PER_CARD standard-edition instances of every
 * Common template — enough (18 Commons today, need 10 at 3 copies for a
 * legal 30-card deck) to build a real deck with zero acquisition friction,
 * while leaving Uncommon-and-above genuinely something packs (roadmap step
 * 5) are the only way to get. Before this, every account got the entire pool
 * (STATUS.md roadmap step 4) — that made packs pointless, since there was
 * nothing left to pull that you didn't already own. Idempotent and safe to
 * call on every sign-in: only tops up what's missing, so it also back-fills
 * any Common template added to the pool after an account's first sign-in.
 *
 * Three queries regardless of pool size — bulk upsert editions, bulk-read
 * current counts, bulk-insert the shortfall — rather than one round-trip per
 * template, since this runs on every sign-in, not just account creation.
 */
export async function grantStartingCollection(pool: Pool, accountId: string): Promise<void> {
  const templateIds = starterTemplateIds();
  if (templateIds.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("begin");

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

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
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
