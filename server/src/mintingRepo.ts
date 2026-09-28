import { CARD_POOL } from "@cryptoclash/engine";
import type { MintableInstance } from "@cryptoclash/web3";
import type { Pool, PoolClient } from "pg";

/**
 * The join collectionRepo.ts never needed until now (confirmed by grep before writing this —
 * every existing query there only aggregates counts per template, never reads a single
 * instance's full attribute set): card_instances -> card_editions for edition_type/foil/
 * condition/serial, then resolves template_id against engine's CARD_POOL for name/rarity/
 * faction/cost/attack/health/keywords/text — rarity and every other gameplay field live only in
 * the engine's own pool, never in the database (same lookup pattern validateOwnership() in
 * collectionRepo.ts already uses). Returns the exact MintableInstance shape web3/src/metadata.ts
 * defines and the compositor (tools/card-render/) consumes, so there's one contract, not two.
 *
 * Not called from any HTTP route yet — this is the missing read path for a future minting
 * trigger, not a live feature.
 */
export async function getMintableInstance(db: Pool | PoolClient, instanceId: string): Promise<MintableInstance | null> {
  const result = await db.query<{
    id: string;
    template_id: string;
    edition_type: MintableInstance["editionType"];
    is_foil: boolean;
    condition_grade: number | null;
    serial_number: number | null;
    is_first_edition: boolean;
  }>(
    `select ci.id, ce.template_id, ce.edition_type, ci.is_foil, ci.condition_grade, ci.serial_number, ci.is_first_edition
     from card_instances ci
     join card_editions ce on ce.id = ci.edition_id
     where ci.id = $1`,
    [instanceId],
  );

  const row = result.rows[0];
  if (!row) return null;

  const template = CARD_POOL[row.template_id];
  if (!template) {
    // A template that existed when this instance was granted but has since been removed/renamed
    // without a data migration — same "don't crash, the caller decides what to do" posture
    // collectionRepo.ts's validateOwnership() takes when CARD_POOL[templateId] is missing.
    return null;
  }

  return {
    instanceId: row.id,
    templateId: row.template_id,
    name: template.name,
    rarity: template.rarity ?? "Common",
    faction: template.faction,
    text: template.text,
    type: template.type,
    cost: template.cost,
    attack: template.attack ?? null,
    health: template.health ?? null,
    keywords: template.keywords ?? [],
    editionType: row.edition_type,
    isFoil: row.is_foil,
    conditionGrade: row.condition_grade,
    serialNumber: row.serial_number,
    isFirstEdition: row.is_first_edition,
  };
}
