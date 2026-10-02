import { CARD_POOL, Rarity } from "@cryptoclash/engine";
import { BrowserProvider, Contract, hexlify, randomBytes } from "ethers";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "../api.js";
import { conditionBandName, conditionVisualTier } from "../conditionGrade.js";
import { EDITION_LABEL, EditionType } from "../editionType.js";
import { playRevealSound } from "../sound.js";
import { track } from "../telemetry.js";
import type { Eip1193Provider } from "../useWallet.js";
import { CardFace } from "./CardFace.js";

const EXCITING_RARITIES: ReadonlySet<Rarity> = new Set(["Rare", "Epic", "Legendary", "Mythic", "Genesis"]);

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
// Still named purchaseFoundersSet on-chain — a cosmetic naming wart from reusing FloorwarsStore.sol
// exactly as already deployed (session 40 repurposed it for packs instead of redeploying; see
// server/src/packsRepo.ts's confirmPackPurchase doc comment for why that's safe).
const STORE_ABI = ["function purchaseFoundersSet(bytes32 intentId) external"];

interface PackDefinition {
  id: string;
  name: string;
  cost: number;
  cardCount: number;
}

interface PackCard {
  templateId: string;
  isFoil: boolean;
  conditionGrade: number;
  editionType?: EditionType;
  serialNumber?: number;
}

interface PurchaseOffer {
  configured: boolean;
  price?: string;
  storeAddress?: string;
  paymentTokenAddress?: string;
  chainId?: number;
}

export interface PacksScreenProps {
  token: string;
  balance: number | null;
  onBalanceChange: (balance: number) => void;
  /** For the real-money purchase flow's on-chain approve + purchase transactions — the player's
   * own wallet signs these, this component never submits anything on their behalf. */
  activeProvider: Eip1193Provider | null;
  onBack: () => void;
  onHome: () => void;
}

const REVEAL_STEP_MS = 350;

type MoneyStep = "idle" | "switching-network" | "approving" | "buying" | "confirming";

const MONEY_STEP_LABEL: Record<MoneyStep, string> = {
  idle: "Buy",
  "switching-network": "Switch network…",
  approving: "Approving…",
  buying: "Confirm in wallet…",
  confirming: "Finishing up…",
};

/** USDG's real 6 decimals — same convention as web3/src/metadata.ts and server/src/packsRepo.ts. */
function formatPrice(raw: string): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 501) return "Real-money purchases aren't live on this server yet.";
    if (e.status === 404) return "We couldn't find your purchase on-chain yet — wait a moment and try confirming again.";
    if (e.status === 409) return "This purchase was already processed.";
    if (e.status === 402) return "Not enough Coins.";
    return e.message;
  }
  const err = e as { code?: number | string; message?: string; shortMessage?: string };
  if (err.code === "ACTION_REJECTED" || err.code === 4001) return "Cancelled in wallet.";
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

/**
 * Every pack can be opened two ways — Coins (the free/earn-only path) or real money, same price
 * either way and the exact same odds (session 40: Full Art/Ultra/Secret are a rare secondary roll
 * on a Legendary pull, not a separate guaranteed product gated behind the money path — see
 * packsRepo.ts's rollEditionType). This replaces the old, separate FoundersSetScreen entirely.
 */
export function PacksScreen({ token, balance, onBalanceChange, activeProvider, onBack, onHome }: PacksScreenProps) {
  const [packs, setPacks] = useState<PackDefinition[]>([]);
  const [offer, setOffer] = useState<PurchaseOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [moneyStep, setMoneyStep] = useState<MoneyStep>("idle");
  const [revealedCards, setRevealedCards] = useState<PackCard[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    apiFetch<{ packs: PackDefinition[] }>("/api/packs")
      .then((res) => setPacks(res.packs))
      .catch((e) => setError((e as Error).message));
    // Never blocks the Coins path on failure — a real-money offer simply doesn't appear if this
    // fails or isn't configured, same "look, don't require" posture GET /api/packs/purchase-offer
    // itself is built for (public, no login wall).
    apiFetch<PurchaseOffer>("/api/packs/purchase-offer")
      .then(setOffer)
      .catch(() => setOffer({ configured: false }));
  }, []);

  function reveal(cards: PackCard[]) {
    setRevealedCards(cards);
    setRevealedCount(0);
    // Reveal one card at a time rather than dumping the whole pack at once —
    // spec.md Section 17 calls this "one of the game's signature moments".
    cards.forEach((card, i) => {
      setTimeout(
        () => {
          setRevealedCount((c) => Math.max(c, i + 1));
          const rarity = CARD_POOL[card.templateId].rarity;
          const special = card.editionType !== undefined && card.editionType !== "standard";
          playRevealSound(special || card.isFoil || (rarity !== undefined && EXCITING_RARITIES.has(rarity)));
        },
        REVEAL_STEP_MS * (i + 1),
      );
    });
  }

  async function openWithCoins(packType: string) {
    setError(null);
    setOpening(true);
    try {
      const result = await apiFetch<{ cards: PackCard[]; balance: number }>("/api/packs/open", {
        method: "POST",
        token,
        body: JSON.stringify({ packType }),
      });
      onBalanceChange(result.balance);
      // packType is one of the server's own pack ids (GET /api/packs), never free text.
      track("pack_opened", { packType });
      reveal(result.cards);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  async function ensureCorrectNetwork(provider: BrowserProvider, expectedChainId: number) {
    const network = await provider.getNetwork();
    if (Number(network.chainId) === expectedChainId) return;
    setMoneyStep("switching-network");
    const hexChainId = `0x${expectedChainId.toString(16)}`;
    try {
      await activeProvider!.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
    } catch (e) {
      // 4902 = the wallet doesn't know this chain yet — offer to add it rather than just failing.
      if ((e as { code?: number }).code === 4902) {
        await activeProvider!.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: "Robinhood Chain Testnet",
              rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }

  async function buyWithMoney(packType: string) {
    if (!offer?.configured || !offer.storeAddress || !offer.paymentTokenAddress || !offer.price || !offer.chainId) return;
    if (!activeProvider) {
      setError("No wallet found — connect a wallet first.");
      return;
    }
    setError(null);
    try {
      const provider = new BrowserProvider(activeProvider);
      await ensureCorrectNetwork(provider, offer.chainId);
      const signer = await provider.getSigner();
      const owner = await signer.getAddress();
      const price = BigInt(offer.price);

      const paymentToken = new Contract(offer.paymentTokenAddress, ERC20_ABI, signer);
      const allowance: bigint = await paymentToken.allowance(owner, offer.storeAddress);
      if (allowance < price) {
        setMoneyStep("approving");
        const approveTx = await paymentToken.approve(offer.storeAddress, price);
        await approveTx.wait();
      }

      setMoneyStep("buying");
      const intentId = hexlify(randomBytes(32));
      const store = new Contract(offer.storeAddress, STORE_ABI, signer);
      const purchaseTx = await store.purchaseFoundersSet(intentId);
      await purchaseTx.wait();

      setMoneyStep("confirming");
      const result = await apiFetch<{ cards: PackCard[]; balance: number }>("/api/packs/confirm-purchase", {
        method: "POST",
        token,
        body: JSON.stringify({ intentId }),
      });
      onBalanceChange(result.balance);
      track("pack_opened", { packType, viaMoney: true });
      reveal(result.cards);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setMoneyStep("idle");
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <button type="button" className="app-bar__logo-btn" onClick={onHome} title="Back to landing">
          <h1>FLOORWARS</h1>
        </button>
        <span className="app-bar__subtitle">packs</span>
        <div className="app-bar__actions">
          <span className="app-bar__coins" title="Coins" aria-label={`Coins: ${balance ?? "loading"}`}>
            🪙 {balance ?? "…"}
          </span>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="packs-screen">
        {error && <p className="deck-picker__empty">{error}</p>}

        {/* The $ price is real pricing, but paying it today genuinely isn't — it's a testnet USDG
            transaction (obtained from a faucet, not purchasable with real dollars), not a real
            charge. Said plainly, in-flow, rather than only in Terms/Privacy — a "Buy — $7.99"
            button with no caveat reads exactly like a real payment button otherwise. */}
        {offer?.configured && !revealedCards && (
          <p className="packs-screen__testnet-note">
            Testnet demo — "Buy" sends a real on-chain transaction, but on Robinhood Chain's public testnet. It costs test
            USDG (free from a faucet), not real dollars. See <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a> for what that means.
          </p>
        )}

        {!revealedCards && (
          <div className="deck-picker__grid">
            {packs.map((pack) => {
              const affordable = balance !== null && balance >= pack.cost;
              const moneyBusy = moneyStep !== "idle";
              return (
                <div key={pack.id} className="deck-picker__card">
                  <span className="deck-picker__card-title">{pack.name}</span>
                  <span className="deck-picker__card-desc">
                    {pack.cardCount} cards · a rare chance at Full Art/Ultra/Secret
                    {offer?.configured && offer.price ? ` · ${pack.cost} Coins or $${formatPrice(offer.price)}` : ` · ${pack.cost} Coins`}
                  </span>
                  <div className="deck-picker__card-actions">
                    <button type="button" disabled={!affordable || opening || moneyBusy} onClick={() => openWithCoins(pack.id)}>
                      {opening ? "Opening…" : affordable ? `Open — ${pack.cost} Coins` : "Not enough Coins"}
                    </button>
                    {offer?.configured && (
                      <button type="button" disabled={opening || moneyBusy} onClick={() => buyWithMoney(pack.id)}>
                        {MONEY_STEP_LABEL[moneyStep]}
                        {moneyStep === "idle" && offer.price ? ` — $${formatPrice(offer.price)}` : ""}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {packs.length === 0 && !error && <p className="deck-picker__empty">Loading packs…</p>}
          </div>
        )}

        {revealedCards && (
          <>
            <div className="pack-reveal" role="status" aria-live="polite" aria-label={`Revealing pack: ${revealedCount} of ${revealedCards.length} cards shown`}>
              {revealedCards.map((card, i) => {
                const special = card.editionType !== undefined && card.editionType !== "standard";
                return (
                  <div key={`${card.templateId}-${i}`} className="pack-reveal__slot">
                    {i < revealedCount ? (
                      <div className="pack-reveal__card">
                        <CardFace
                          template={CARD_POOL[card.templateId]}
                          size="hand"
                          foil={card.isFoil}
                          conditionGrade={card.conditionGrade}
                          editionType={card.editionType}
                        />
                        {special && (
                          <span className="pack-reveal__edition-tag">
                            {EDITION_LABEL[card.editionType as Exclude<EditionType, "standard">]}
                            {card.serialNumber !== undefined ? ` · #${card.serialNumber}` : ""}
                          </span>
                        )}
                        {card.isFoil && <span className="pack-reveal__foil-tag">✨ Foil</span>}
                        {conditionVisualTier(card.conditionGrade) && (
                          <span className={`pack-reveal__condition-tag pack-reveal__condition-tag--${conditionVisualTier(card.conditionGrade)}`}>
                            {conditionVisualTier(card.conditionGrade) === "pristine" ? "💎" : "〰️"} {conditionBandName(card.conditionGrade)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="pack-reveal__back" />
                    )}
                  </div>
                );
              })}
            </div>
            {revealedCount >= revealedCards.length && (
              <button type="button" className="end-turn-btn" onClick={() => setRevealedCards(null)}>
                Continue
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
