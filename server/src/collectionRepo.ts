import { CARD_POOL, Faction, MAX_COPIES_PER_CARD } from "@cryptoclash/engine";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "./txHelper.js";

/** The six real factions a player can pick as their free starting set — Neutral isn't choosable (see starterTemplateIds). */
export const STARTING_FACTIONS: readonly Faction[] = ["Doggos", "Frogs", "Apes", "Bulls", "Bears", "Cats"];

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
 * Bears and Apes used to have only one Common template each (Junior
 * Dev, Degen Ape) vs. 3-4 for every other faction — fixed by adding two more
 * Commons per faction (Code Monkey/Ship-It Bruin, Overleveraged Gibbon/Slow Burn), so
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
      `insert into card_instances (owner_id, edition_id, condition_grade) select $1, unnest($2::uuid[]), $3`,
      [accountId, toInsert, BASELINE_CONDITION_GRADE],
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

/** A single card grant: which template, whether this copy rolled the pack's cosmetic foil chance,
 * its rolled Condition (Floor Grade, collectibility.md Section 7) — 1-10, permanent once granted
 * — and its rolled Edition. `editionType` is omitted (or "standard") for the overwhelming majority
 * of pulls; packsRepo.ts only ever sets it to a non-standard tier on the rare secondary roll that
 * fires when a slot's Rarity roll comes up Legendary (session 40 — replaces the old separate
 * guaranteed-$7.99-Founders-Set product with specials sprinkled into ordinary packs instead). */
export interface PackCard {
  templateId: string;
  isFoil: boolean;
  conditionGrade: number;
  editionType?: "standard" | "full_art" | "ultra" | "secret";
}

/**
 * The fixed, zero-RNG Condition grade (Section 7's "Near Prime" band) for
 * every path that isn't a real pack roll — Starter Decks
 * (grantStartingCollectionWithClient below) and Crafting (craftingRepo.ts),
 * both already deterministic/non-foil/Standard-Edition-only by design, so a
 * random Condition roll would be the odd one out among their guarantees.
 */
export const BASELINE_CONDITION_GRADE = 7;

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
  // This bulk path always inserts 'standard' edition_type below — it has no serial-number logic
  // (that only applies to non-standard editions, collectibility.md §6) and no per-row edition
  // column in its unnest(). A non-standard card reaching here would silently get downgraded to
  // Standard rather than erroring, which is worse than failing loudly — callers must route any
  // special-edition card through grantSpecialEditionInstance instead (see packsRepo.ts's own
  // partitioning of a roll's cards before granting).
  if (cards.some((c) => c.editionType && c.editionType !== "standard")) {
    throw new Error("grantCardInstances only grants Standard-edition cards — route non-standard cards through grantSpecialEditionInstance.");
  }
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
  const conditionGrades = cards.map((c) => c.conditionGrade);

  // Three unnest() calls in one SELECT list run in lockstep since Postgres 10 — zips
  // editionIds[i]/isFoils[i]/conditionGrades[i] together, not a cross join, as long as
  // all three arrays are the same length.
  await client.query(
    `insert into card_instances (owner_id, edition_id, is_foil, condition_grade)
     select $1, unnest($2::uuid[]), unnest($3::boolean[]), unnest($4::smallint[])`,
    [accountId, editionIds, isFoils, conditionGrades],
  );
}

/** One non-Standard-edition pull — see grantSpecialEditionInstance below. editionType is never
 * 'standard' here by construction (callers only reach this function for a card that already
 * rolled a special tier); typed narrower than PackCard's own optional field to keep that
 * invariant visible at the call site rather than just asserted in a comment. */
export interface SpecialEditionCard {
  templateId: string;
  editionType: "full_art" | "ultra" | "secret";
  isFoil: boolean;
  conditionGrade: number;
}

/**
 * Grants one special-edition card at a time — unlike grantCardInstances' bulk unnest() above,
 * each instance needs its own serial number (collectibility.md §6: "only make sense attached to
 * [non-Standard] output"), computed as a count-and-lock on its specific (template, editionType)
 * card_editions row so two concurrent grants rolling the same card+edition can never be handed
 * the same serial. Originally built for the one-time Founders Set product (a deliberate purchase
 * flow, so the per-card round trip wasn't the real performance concern it would be in
 * packsRepo.ts's bulk path); session 40 folded Full Art/Ultra/Secret into ordinary pack rolls
 * instead, still via this same per-instance path since they're rare enough per pack (at most a
 * couple of a 5-card pack's slots, usually zero) that the round-trip cost stays negligible.
 *
 * `is_first_edition` is always false here now — that flag specifically meant "part of the
 * original Founders Set launch window" (collectibility.md §10.5), a concept that stopped existing
 * once specials became an ongoing pack mechanic rather than a one-time print run.
 */
export async function grantSpecialEditionInstance(
  client: PoolClient,
  accountId: string,
  card: SpecialEditionCard,
): Promise<{ instanceId: string; serialNumber: number }> {
  const editionRow = await client.query<{ id: string }>(
    `insert into card_editions (template_id, edition_type)
     values ($1, $2)
     on conflict (template_id, edition_type) do update set template_id = excluded.template_id
     returning id`,
    [card.templateId, card.editionType],
  );
  const editionId = editionRow.rows[0].id;

  // Locks this specific edition row so a concurrent grant for the same template+edition can't
  // read the same "next serial" before this transaction commits its own insert below.
  await client.query(`select id from card_editions where id = $1 for update`, [editionId]);

  const countRow = await client.query<{ count: string }>(
    `select count(*)::int as count from card_instances where edition_id = $1`,
    [editionId],
  );
  const serialNumber = Number(countRow.rows[0].count) + 1;

  const instanceRow = await client.query<{ id: string }>(
    `insert into card_instances (owner_id, edition_id, is_foil, condition_grade, serial_number, is_first_edition)
     values ($1, $2, $3, $4, $5, false)
     returning id`,
    [accountId, editionId, card.isFoil, card.conditionGrade, serialNumber],
  );

  return { instanceId: instanceRow.rows[0].id, serialNumber };
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

/** Non-Standard print tiers, ranked for "best owned" purposes (collectibility.md §4/§8) — Secret
 * outranks Ultra outranks Full Art, matching the Edition ladder's own ordering. Index 0 (Standard)
 * never appears in the ranked-edition result below (only a real special-edition pull sets a rank
 * > 0), kept only so the SQL `case` below and this array agree on the same 0-3 numbering. */
const EDITION_BY_RANK = ["standard", "full_art", "ultra", "secret"] as const;

/**
 * Owned copy counts, owned foil copy counts, and the best non-Standard edition owned (if any) per
 * template id, in one query — the collection screen (spec.md Section 19) needs all three together,
 * and conditional aggregates (`count(...) filter (...)`, `max(case ...)`) get them from the same
 * scan/join getCollectionCounts already does, rather than extra DB round trips. Deliberately not
 * folded into getCollectionCounts itself: deck-ownership gating (validateOwnership below) only
 * ever needs plain owned counts, and must never care about foil/edition — that function stays
 * as-is so nothing there can accidentally start depending on either.
 */
export async function getCollectionSummary(
  pool: Pool,
  accountId: string,
): Promise<{ owned: Record<string, number>; foils: Record<string, number>; specialEditions: Record<string, "full_art" | "ultra" | "secret"> }> {
  const result = await pool.query<{ template_id: string; count: string; foil_count: string; best_edition_rank: number }>(
    `select ce.template_id as template_id,
            count(ci.id)::int as count,
            count(ci.id) filter (where ci.is_foil)::int as foil_count,
            max(case ce.edition_type
                  when 'secret' then 3
                  when 'ultra' then 2
                  when 'full_art' then 1
                  else 0
                end) as best_edition_rank
     from card_instances ci
     join card_editions ce on ce.id = ci.edition_id
     where ci.owner_id = $1
     group by ce.template_id`,
    [accountId],
  );
  const owned: Record<string, number> = {};
  const foils: Record<string, number> = {};
  const specialEditions: Record<string, "full_art" | "ultra" | "secret"> = {};
  for (const row of result.rows) {
    owned[row.template_id] = Number(row.count);
    const foilCount = Number(row.foil_count);
    if (foilCount > 0) foils[row.template_id] = foilCount;
    const rank = Number(row.best_edition_rank);
    if (rank > 0) specialEditions[row.template_id] = EDITION_BY_RANK[rank] as "full_art" | "ultra" | "secret";
  }
  return { owned, foils, specialEditions };
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
