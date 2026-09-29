import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetadata, tokenIdToUriHex, type MintableInstance, type NftMetadata } from "@cryptoclash/web3";
// tools/card-render is a sibling workspace with no package "main"/exports (its package.json only
// declares its playwright dependency) — imported by relative path, same as web3/scripts/
// mintSampleInstances.ts already does.
import { renderCardInstance } from "../../tools/card-render/render-card.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
// Gitignored, not committed — see server/src/nftAssets.ts's own comment below on why this being
// wiped on every Railway redeploy (ephemeral filesystem) is fine, not a real dependency.
const GENERATED_DIR = path.join(REPO_ROOT, "server/generated/nft");

export class ArtNotReadyError extends Error {}

/** Just enough of MintableInstance for art-path selection — editionType optional, defaulting to Standard, same as render-card.mjs's own RenderableCard. */
type ArtLookup = Pick<MintableInstance, "templateId"> & { editionType?: MintableInstance["editionType"] };

/**
 * Full Art/Ultra/Secret Editions composite from a real *different* illustration
 * (full-art-prompts.md), not the Standard art with a border swapped — collectibility.md §4/§8:
 * "alternate, full-bleed illustrated artwork," not a crop of the Standard print. Ultra and Secret
 * deliberately share the same Full Art source image (a render-time presentation distinction, not
 * a third generated asset — full-art-prompts.md's own scope note) rather than needing their own.
 */
function artPathFor(instance: ArtLookup): string {
  const isStandardEdition = !instance.editionType || instance.editionType === "standard";
  return path.join(
    REPO_ROOT,
    isStandardEdition ? `client/src/assets/cards/${instance.templateId}.jpg` : `client/src/assets/cards/full-art/${instance.templateId}.jpg`,
  );
}

/**
 * Whether this session's instance actually has an on-disk illustration to composite. Per
 * STATUS.md's wiring table, not every CARD_POOL template has generated art yet — minting must
 * refuse rather than silently mint a card with a broken/placeholder image baked into an
 * otherwise-permanent on-chain asset. Checks the Full Art pool for a non-Standard instance,
 * same "refuse cleanly" posture — full-art-prompts.md's own 11-template pool is deliberately
 * narrower than the full Standard roster.
 */
export function hasArt(instance: ArtLookup): boolean {
  return existsSync(artPathFor(instance));
}

/**
 * Composites (or returns the already-cached) flat PNG for one minted instance, keyed by its
 * token id's URI hex — the same key the /api/metadata/:hex.png route reads back. Railway's
 * filesystem is ephemeral across deploys, so this cache is purely a same-deploy speed
 * optimization; card_instances (via mintingRepo.ts) is the only real source of truth, and a
 * cache miss (including "the whole directory is gone after a redeploy") just re-renders from it.
 */
export async function renderAndCacheImage(instance: MintableInstance, tokenId: bigint): Promise<Buffer> {
  if (!hasArt(instance)) {
    const editionNote = instance.editionType && instance.editionType !== "standard" ? ` (${instance.editionType} edition)` : "";
    throw new ArtNotReadyError(`No generated art exists yet for "${instance.templateId}"${editionNote} — can't mint it.`);
  }
  mkdirSync(GENERATED_DIR, { recursive: true });
  const hex = tokenIdToUriHex(tokenId);
  const outPath = path.join(GENERATED_DIR, `${hex}.png`);
  if (!existsSync(outPath)) {
    await renderCardInstance(instance, artPathFor(instance), outPath);
  }
  return readFileSync(outPath);
}

/** Absolute origin this request was actually reached on — Railway terminates TLS at its proxy,
 * so `x-forwarded-proto` (not the raw socket) is the real scheme, same reasoning httpApi.ts's
 * getClientIp already applies to x-forwarded-for. PUBLIC_SERVER_URL overrides both when set,
 * for a deploy that wants a stable custom domain in its minted metadata regardless of the host
 * header a given request arrived on. */
export function publicBaseUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const configured = process.env.PUBLIC_SERVER_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? "http";
  return `${proto}://${req.headers.host ?? "localhost"}`;
}

/** Builds this instance's metadata, pointed at this server's own /api/metadata/:hex.png route for the `image` field — see server/src/httpApi.ts. */
export function metadataFor(instance: MintableInstance, tokenId: bigint, baseUrl: string): NftMetadata {
  const hex = tokenIdToUriHex(tokenId);
  return buildMetadata(instance, `${baseUrl}/api/metadata/${hex}.png`);
}
