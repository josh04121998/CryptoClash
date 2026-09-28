/**
 * Generic, chain-agnostic config — swapping chains later (or moving from testnet to mainnet) is
 * an env-var change here, never a code change. Deliberately named WEB3_* rather than
 * ROBINHOOD_*, per architecture.md Section 8's "build this chain-agnostically" guidance.
 */
export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
}

/** Throws on any missing var, matching server/src/db.ts's existing hard-required-env pattern. */
export function loadChainConfig(): ChainConfig {
  const chainId = process.env.WEB3_CHAIN_ID;
  const rpcUrl = process.env.WEB3_RPC_URL;
  const contractAddress = process.env.WEB3_CONTRACT_ADDRESS;

  if (!chainId) throw new Error("WEB3_CHAIN_ID is not set.");
  if (!rpcUrl) throw new Error("WEB3_RPC_URL is not set.");
  if (!contractAddress) throw new Error("WEB3_CONTRACT_ADDRESS is not set.");

  return { chainId: Number(chainId), rpcUrl, contractAddress };
}
