import { CARD_POOL, MAX_COPIES_PER_CARD } from "@cryptoclash/engine";
import type { Pool } from "pg";

/**
 * Every non-token template id in the pool, grantable as a starting collection.
 * Recomputed from CARD_POOL each call (not cached) so a newly-added template
 * shows up automatically without a code change here.
 */
function ownableTemplateIds(): string[] {
  return Object.values(CARD_POOL)
    .filter((t) => !t.token)
    .map((t) => t.id);
}

/**
 * Grants an account MAX_COPIES_PER_CARD standard-edition instances of every
 * ownable template — the current "everyone starts with the full pool"
 * baseline (STATUS.md roadmap step 4: real ownership plumbing without
 * regressing deck-building freedom until packs/duplicate-protection exist to
 * be the actual acquisition path). Idempotent and safe to call on every
 * sign-in: only tops up what's missing, so it also back-fills any template
 * added to the pool after an account's first sign-in.
 *
 * Three queries regardless of pool size — bulk upsert editions, bulk-read
 * current counts, bulk-insert the shortfall — rather than one round-trip per
 * template, since this runs on every sign-in, not just account creation.
 */
export async function grantStartingCollection(pool: Pool, accountId: string): Promise<void> {
  const templateIds = ownableTemplateIds();
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
