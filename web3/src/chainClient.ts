import { Contract, JsonRpcProvider, Wallet, type ContractTransactionResponse, type Provider, type Signer } from "ethers";
import type { ChainConfig } from "./chainConfig.js";

// A minimal hand-written ABI fragment (just what this client actually calls) rather than
// importing Hardhat's generated artifact JSON — keeps this workspace's reusable src/ decoupled
// from needing `hardhat compile` to have run first, since a future `server` consumer only needs
// this file, not the whole Hardhat toolchain.
const FLOORWARS_CARDS_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function uri(uint256 id) view returns (string)",
  "function owner() view returns (address)",
  "function mint(address to, uint256 id, uint256 amount, bytes data)",
];

/**
 * A thin, chain-agnostic wrapper over ethers — the actual chain (Robinhood Chain testnet today,
 * anything EVM-compatible later per architecture.md Section 8) is entirely determined by the
 * ChainConfig passed in, never hardcoded here. Not wired into `server` yet — this is the piece a
 * future integration would import as a workspace dependency (`"@cryptoclash/web3": "*"`, the same
 * pattern `shared` uses to depend on `engine`).
 */
export class ChainClient {
  private readonly provider: Provider;
  private readonly contract: Contract;

  /** Pass `operatorPrivateKey` only when this client needs to submit transactions (mint); a read-only client can omit it. */
  constructor(config: ChainConfig, operatorPrivateKey?: string) {
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    const runner: Provider | Signer = operatorPrivateKey ? new Wallet(operatorPrivateKey, this.provider) : this.provider;
    this.contract = new Contract(config.contractAddress, FLOORWARS_CARDS_ABI, runner);
  }

  /** Read-only — how many of `tokenId` `owner` currently holds on-chain. */
  async getBalanceOf(owner: string, tokenId: bigint): Promise<bigint> {
    return this.contract.balanceOf(owner, tokenId);
  }

  /** Requires this client to have been constructed with an operator private key. */
  async mint(to: string, tokenId: bigint, amount: bigint): Promise<ContractTransactionResponse> {
    return this.contract.mint(to, tokenId, amount, "0x");
  }
}
