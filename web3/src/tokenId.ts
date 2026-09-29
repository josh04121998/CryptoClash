/**
 * Token-ID scheme (session 36) — no token-ID-to-serial-number design existed anywhere before
 * this; collectibility.md Section 13 explicitly left it open.
 *
 * Every individually-cosmetic card_instances row (foil, condition grade, edition, serial number
 * can all vary independently per row) needs its own distinguishable on-chain identity so it can
 * carry its own image/metadata — the user's explicit ask was that instances look different
 * on-chain, not just in a metadata trait list. So each `card_instances` row gets its own ERC-1155
 * token ID, always minted in quantity 1 — a normal, common way to use ERC-1155 for one-of-a-kind
 * items (no contract change needed; FloorwarsCards.sol already mints arbitrary (id, amount)
 * pairs).
 *
 * The ID itself is derived deterministically from the instance's own UUID (`card_instances.id`)
 * rather than a separately-tracked counter: strip the dashes, parse the 32 hex chars as a single
 * 128-bit integer. This needs no registry, can't collide (UUIDs already can't), and is trivially
 * reversible both directions without any extra state to keep in sync with the database.
 */
export function deriveTokenId(instanceId: string): bigint {
  const hex = instanceId.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`deriveTokenId: "${instanceId}" is not a valid UUID`);
  }
  return BigInt(`0x${hex}`);
}

/** Inverse of deriveTokenId — recovers the UUID a token ID was derived from, for lookups/debugging. */
export function tokenIdToInstanceId(tokenId: bigint): string {
  const hex = tokenId.toString(16).padStart(32, "0");
  if (hex.length !== 32) {
    throw new Error(`tokenIdToInstanceId: ${tokenId} does not fit in 128 bits, was not produced by deriveTokenId`);
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * ERC-1155's `{id}` URI-substitution format (EIP-1155): lowercase hex, no `0x` prefix, zero-
 * padded to 64 characters (256 bits) regardless of the token id's actual bit width — this is
 * what a marketplace/wallet substitutes into the contract's base `uri()` template, and what
 * server/src's metadata/image routes must accept to be spec-compliant. The inverse,
 * uriHexToTokenId, accepts any length up to 64 (a marketplace always sends the full padded
 * form, but this stays lenient for manual/script use).
 */
export function tokenIdToUriHex(tokenId: bigint): string {
  return tokenId.toString(16).padStart(64, "0");
}

export function uriHexToTokenId(hex: string): bigint {
  if (!/^[0-9a-f]{1,64}$/i.test(hex)) {
    throw new Error(`uriHexToTokenId: "${hex}" is not valid hex`);
  }
  return BigInt(`0x${hex}`);
}
