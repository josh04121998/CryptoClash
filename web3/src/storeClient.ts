import { Contract, JsonRpcProvider, type Provider } from "ethers";
import type { StoreConfig } from "./chainConfig.js";

const FLOORWARS_STORE_ABI = [
  "function purchased(bytes32 intentId) view returns (bool)",
  "function price() view returns (uint256)",
  "function treasury() view returns (address)",
  "event Purchase(address indexed buyer, bytes32 indexed intentId, uint256 amount)",
];

/**
 * Read-only by design, unlike ChainClient — the actual purchase transaction is a program call
 * the *player's own wallet* makes directly against FloorwarsStore (approve, then
 * purchaseFoundersSet), never something the backend submits on their behalf the way minting
 * does. The server's only job is to verify a specific purchase really happened and really came
 * from the account claiming it.
 */
export class StoreClient {
  private readonly provider: Provider;
  private readonly contract: Contract;

  constructor(config: StoreConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.contract = new Contract(config.storeAddress, FLOORWARS_STORE_ABI, this.provider);
  }

  /** The store's current price, in the payment token's smallest unit (USDG uses 6 decimals). */
  async getPrice(): Promise<bigint> {
    return this.contract.price();
  }

  /**
   * Confirms `intentId` was actually paid on-chain by `expectedBuyer` (case-insensitive address
   * compare), and returns the amount paid if so. `intentId` is an indexed event topic, so this
   * needs no tx hash from the client at all — just the same 32-byte id the client generated and
   * passed to `purchaseFoundersSet`. Returns null for "never paid" or "paid by someone else,"
   * without distinguishing the two — same "don't leak which is which" posture as everything else
   * this server keeps quiet about cross-account state.
   */
  async verifyPurchase(intentId: string, expectedBuyer: string): Promise<{ amount: bigint } | null> {
    const events = await this.contract.queryFilter(this.contract.filters.Purchase(null, intentId));
    const event = events[0];
    if (!event || !("args" in event)) return null;
    const args = event.args as unknown as { buyer: string; intentId: string; amount: bigint };
    if (args.buyer.toLowerCase() !== expectedBuyer.toLowerCase()) return null;
    return { amount: args.amount };
  }
}
