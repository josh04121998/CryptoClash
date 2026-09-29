import { CARD_POOL } from "@cryptoclash/engine";
import { deriveTokenId, tokenIdToInstanceId, tokenIdToUriHex, uriHexToTokenId, type MintableInstance } from "@cryptoclash/web3";
import type { Pool, PoolClient } from "pg";
import { getChainClient } from "./chain.js";
import { ArtNotReadyError, renderAndCacheImage } from "./nftAssets.js";

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

/** One instance the Collection screen's per-template picker shows, so a player can choose which specific copy to mint. */
export interface InstanceSummary {
  id: string;
  isFoil: boolean;
  conditionGrade: number | null;
  serialNumber: number | null;
  isFirstEdition: boolean;
  /** Set once mintInstance() below has confirmed the on-chain mint. */
  onchainTokenId: string | null;
  /** A mint attempt is in flight (see mintInstance's claim-then-mint-then-finalize shape) — the client should show a pending state, not offer to mint again. */
  minting: boolean;
}

/** This account's own copies of one template, oldest-acquired first — the source for GET /api/collection/:templateId/instances. */
export async function listInstancesForTemplate(pool: Pool, accountId: string, templateId: string): Promise<InstanceSummary[]> {
  const result = await pool.query<{
    id: string;
    is_foil: boolean;
    condition_grade: number | null;
    serial_number: number | null;
    is_first_edition: boolean;
    onchain_token_id: string | null;
  }>(
    `select ci.id, ci.is_foil, ci.condition_grade, ci.serial_number, ci.is_first_edition, ci.onchain_token_id
     from card_instances ci
     join card_editions ce on ce.id = ci.edition_id
     where ci.owner_id = $1 and ce.template_id = $2
     order by ci.acquired_at asc`,
    [accountId, templateId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    isFoil: row.is_foil,
    conditionGrade: row.condition_grade,
    serialNumber: row.serial_number,
    isFirstEdition: row.is_first_edition,
    onchainTokenId: row.onchain_token_id === "pending" ? null : row.onchain_token_id,
    minting: row.onchain_token_id === "pending",
  }));
}

interface InstanceMintStatus {
  ownerId: string;
  ownerWalletAddress: string;
  onchainTokenId: string | null;
}

async function getInstanceMintStatus(db: Pool | PoolClient, instanceId: string): Promise<InstanceMintStatus | null> {
  const result = await db.query<{ owner_id: string; wallet_address: string; onchain_token_id: string | null }>(
    `select ci.owner_id, a.wallet_address, ci.onchain_token_id
     from card_instances ci
     join accounts a on a.id = ci.owner_id
     where ci.id = $1`,
    [instanceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ownerId: row.owner_id, ownerWalletAddress: row.wallet_address, onchainTokenId: row.onchain_token_id };
}

export class InstanceNotFoundError extends Error {}
export class NotOwnerError extends Error {}
export class AlreadyMintedError extends Error {}
export class MintingNotConfiguredError extends Error {}

export interface MintResult {
  tokenId: string;
  txHash: string;
  imageUrl: string;
  metadataUrl: string;
}

/**
 * Mints one card_instances row as its own ERC-1155 token (session 36's token-ID scheme —
 * deriveTokenId — one id per instance, qty 1) to its owner's own wallet, then records the
 * result on the row so it can never be minted twice.
 *
 * Claim-then-mint-then-finalize, not a single DB transaction wrapping the chain call: the chain
 * call is a slow network round-trip (real block confirmation, even on testnet can take several
 * seconds), and holding a Postgres row lock — or a whole pool connection — across that would be
 * a real liveness cost for no real safety benefit here. Instead, `onchain_token_id` briefly
 * doubles as an in-flight marker: a single atomic `update ... where onchain_token_id is null`
 * both claims the attempt and rules out a second concurrent claim (the same compare-and-set
 * shape questsRepo.ts's claimQuest already uses), released back to null if minting fails so the
 * player can retry, and only ever set to a real token id once the on-chain mint is confirmed.
 */
export async function mintInstance(pool: Pool, accountId: string, instanceId: string, baseUrl: string): Promise<MintResult> {
  const chainClient = getChainClient();
  if (!chainClient) throw new MintingNotConfiguredError("Minting isn't configured on this server.");

  const claim = await pool.query<{ id: string }>(
    `update card_instances set onchain_token_id = 'pending'
     where id = $1 and owner_id = $2 and onchain_token_id is null
     returning id`,
    [instanceId, accountId],
  );

  if (claim.rows.length === 0) {
    const status = await getInstanceMintStatus(pool, instanceId);
    if (!status) throw new InstanceNotFoundError("No such card instance.");
    if (status.ownerId !== accountId) throw new NotOwnerError("You don't own this card.");
    throw new AlreadyMintedError("This card is already minted, or a mint is already in progress.");
  }

  try {
    const [instance, status] = await Promise.all([getMintableInstance(pool, instanceId), getInstanceMintStatus(pool, instanceId)]);
    // Can't actually be null here — the claim above just confirmed the row exists — but keeps
    // this function honest about its own return types rather than asserting past them.
    if (!instance || !status) throw new InstanceNotFoundError("No such card instance.");

    const tokenId = deriveTokenId(instanceId);
    await renderAndCacheImage(instance, tokenId);

    const tx = await chainClient.mint(status.ownerWalletAddress, tokenId, 1n);
    await tx.wait();

    await pool.query(`update card_instances set onchain_token_id = $2 where id = $1`, [instanceId, tokenId.toString()]);

    const hex = tokenIdToUriHex(tokenId);
    return {
      tokenId: tokenId.toString(),
      txHash: tx.hash,
      imageUrl: `${baseUrl}/api/metadata/${hex}.png`,
      metadataUrl: `${baseUrl}/api/metadata/${hex}.json`,
    };
  } catch (e) {
    await pool.query(
      `update card_instances set onchain_token_id = null where id = $1 and onchain_token_id = 'pending'`,
      [instanceId],
    );
    throw e;
  }
}

/**
 * Looks up an already-minted instance by the exact hex form a marketplace/wallet would request
 * (EIP-1155's `{id}` URI substitution — see tokenIdToUriHex) — the shared lookup for both
 * GET /api/metadata/:hex.json and .png. Deliberately 404s (returns null) for a real instance
 * that hasn't actually been minted yet (onchain_token_id null or still 'pending'), not just a
 * nonexistent one — nothing should be publicly resolvable under a token id before the real mint
 * that id belongs to has actually confirmed on-chain.
 */
export async function resolveMintedInstanceByUriHex(pool: Pool, hex: string): Promise<{ instance: MintableInstance; tokenId: bigint } | null> {
  let tokenId: bigint;
  let instanceId: string;
  try {
    tokenId = uriHexToTokenId(hex);
    instanceId = tokenIdToInstanceId(tokenId);
  } catch {
    return null;
  }
  const status = await getInstanceMintStatus(pool, instanceId);
  if (!status || status.onchainTokenId !== tokenId.toString()) return null;
  const instance = await getMintableInstance(pool, instanceId);
  if (!instance) return null;
  return { instance, tokenId };
}

export { ArtNotReadyError };
