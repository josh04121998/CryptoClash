import { ChainClient, loadChainConfig, loadStoreConfig, StoreClient } from "@cryptoclash/web3";

/**
 * Deliberately NOT memoized like db.ts's pool — constructing a ChainClient is cheap and purely
 * synchronous (ethers' JsonRpcProvider/Contract don't dial anything until a call is actually
 * made), so there's no real cost to re-reading env and re-constructing on every call, and doing
 * so avoids a stale-negative-cache trap: a memoized "not configured" result would stay null
 * forever even if WEB3_* env vars were set later in the process's life (real in tests, which set
 * them after this module has already been imported and possibly already called once).
 *
 * Tolerant of missing/invalid WEB3_* config either way — dev/test/CI never set these (same
 * reasoning ADMIN_SECRET's routes use) — so callers 501 instead of crashing the whole process on
 * a misconfigured deploy.
 */
export function getChainClient(): ChainClient | null {
  const operatorKey = process.env.WEB3_OPERATOR_PRIVATE_KEY;
  if (!operatorKey) return null;
  try {
    return new ChainClient(loadChainConfig(), operatorKey);
  } catch (e) {
    console.error("[chain] WEB3_* env vars are set but invalid, minting stays disabled:", (e as Error).message);
    return null;
  }
}

/**
 * Read-only, so no operator key gate here unlike getChainClient() above — StoreClient never
 * submits a transaction itself (the player's own wallet calls FloorwarsStore directly), it only
 * verifies one happened. Still tolerant of missing/invalid store config (WEB3_STORE_CONTRACT_ADDRESS,
 * WEB3_USDG_ADDRESS) for the same dev/test/CI reason getChainClient() is.
 */
export function getStoreClient(): StoreClient | null {
  try {
    return new StoreClient(loadStoreConfig());
  } catch (e) {
    if (e instanceof Error && e.message.includes("is not set")) return null;
    console.error("[chain] WEB3_STORE_* env vars are set but invalid, Founders Set purchases stay disabled:", (e as Error).message);
    return null;
  }
}
