import { CARD_POOL } from "@cryptoclash/engine";
import { BrowserProvider, Contract, hexlify, randomBytes } from "ethers";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "../api.js";
import { conditionBandName, conditionVisualTier } from "../conditionGrade.js";
import { playRevealSound } from "../sound.js";
import { track } from "../telemetry.js";
import type { Eip1193Provider } from "../useWallet.js";
import { CardFace } from "./CardFace.js";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
const STORE_ABI = ["function purchaseFoundersSet(bytes32 intentId) external"];

interface FoundersSetOffer {
  configured: boolean;
  price?: string;
  storeAddress?: string;
  paymentTokenAddress?: string;
  chainId?: number;
}

interface GrantedCard {
  templateId: string;
  editionType: "full_art" | "ultra" | "secret";
  isFoil: boolean;
  conditionGrade: number;
  serialNumber: number;
}

export interface FoundersSetScreenProps {
  token: string;
  activeProvider: Eip1193Provider | null;
  onBack: () => void;
  onHome: () => void;
}

const EDITION_LABEL: Record<GrantedCard["editionType"], string> = {
  full_art: "✨ Full Art",
  ultra: "🌟 Ultra",
  secret: "💎 Secret",
};

type PurchaseStep = "idle" | "switching-network" | "approving" | "buying" | "confirming";

const STEP_LABEL: Record<PurchaseStep, string> = {
  idle: "Buy",
  "switching-network": "Switch network…",
  approving: "Approving…",
  buying: "Confirm in wallet…",
  confirming: "Finishing up…",
};

/** USDG's real 6 decimals — same convention as web3/src/metadata.ts and server/src/foundersSetRepo.ts. */
function formatPrice(raw: string): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 501) return "Founders Set purchases aren't live on this server yet.";
    if (e.status === 404) return "We couldn't find your purchase on-chain yet — wait a moment and try confirming again.";
    if (e.status === 409) return "This purchase was already processed.";
    return e.message;
  }
  const err = e as { code?: number | string; message?: string; shortMessage?: string };
  if (err.code === "ACTION_REJECTED" || err.code === 4001) return "Cancelled in wallet.";
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

/**
 * The Founders Set real-money purchase flow (collectibility.md §13 item 5) — a real program call
 * the player's own wallet makes (approve, then FloorwarsStore.purchaseFoundersSet), never
 * something the backend submits on their behalf. Mirrors PacksScreen's own "offer, then reveal"
 * shape, but the "open" step is an on-chain transaction instead of a same-request server call.
 */
export function FoundersSetScreen({ token, activeProvider, onBack, onHome }: FoundersSetScreenProps) {
  const [offer, setOffer] = useState<FoundersSetOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<PurchaseStep>("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [grantedCards, setGrantedCards] = useState<GrantedCard[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    apiFetch<FoundersSetOffer>("/api/founders-set")
      .then(setOffer)
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  async function ensureCorrectNetwork(provider: BrowserProvider, expectedChainId: number) {
    const network = await provider.getNetwork();
    if (Number(network.chainId) === expectedChainId) return;
    setStep("switching-network");
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

  async function handleBuy() {
    if (!offer?.configured || !offer.storeAddress || !offer.paymentTokenAddress || !offer.price || !offer.chainId) return;
    if (!activeProvider) {
      setPurchaseError("No wallet found — connect a wallet first.");
      return;
    }
    setPurchaseError(null);
    try {
      const provider = new BrowserProvider(activeProvider);
      await ensureCorrectNetwork(provider, offer.chainId);
      const signer = await provider.getSigner();
      const owner = await signer.getAddress();
      const price = BigInt(offer.price);

      const paymentToken = new Contract(offer.paymentTokenAddress, ERC20_ABI, signer);
      const allowance: bigint = await paymentToken.allowance(owner, offer.storeAddress);
      if (allowance < price) {
        setStep("approving");
        const approveTx = await paymentToken.approve(offer.storeAddress, price);
        await approveTx.wait();
      }

      setStep("buying");
      const intentId = hexlify(randomBytes(32));
      const store = new Contract(offer.storeAddress, STORE_ABI, signer);
      const purchaseTx = await store.purchaseFoundersSet(intentId);
      await purchaseTx.wait();

      setStep("confirming");
      const result = await apiFetch<{ cards: GrantedCard[] }>("/api/founders-set/confirm", {
        method: "POST",
        token,
        body: JSON.stringify({ intentId }),
      });
      track("founders_set_purchased", { cardCount: result.cards.length });
      setGrantedCards(result.cards);
      setRevealedCount(0);
      result.cards.forEach((card, i) => {
        setTimeout(
          () => {
            setRevealedCount((c) => Math.max(c, i + 1));
            playRevealSound(true); // every Founders Set pull is a genuine chase card — always the exciting sound
          },
          350 * (i + 1),
        );
      });
    } catch (e) {
      setPurchaseError(describeError(e));
    } finally {
      setStep("idle");
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <button type="button" className="app-bar__logo-btn" onClick={onHome} title="Back to landing">
          <h1>FLOORWARS</h1>
        </button>
        <span className="app-bar__subtitle">founders set</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="packs-screen">
        {loadError && <p className="deck-picker__empty">Couldn't load the Founders Set offer: {loadError}</p>}
        {!loadError && !offer && <p className="deck-picker__prompt">Loading…</p>}

        {offer && !offer.configured && <p className="deck-picker__empty">The Founders Set isn't available yet — check back soon.</p>}

        {offer?.configured && !grantedCards && (
          <div className="deck-picker__grid">
            <div className="deck-picker__card">
              <span className="deck-picker__card-title">Founders Set</span>
              <span className="deck-picker__card-desc">
                3 cards · First Edition, Full Art or better · Serial-numbered · ${formatPrice(offer.price!)} USDG
              </span>
              <div className="deck-picker__card-actions">
                <button type="button" disabled={step !== "idle"} onClick={handleBuy}>
                  {STEP_LABEL[step]}
                </button>
              </div>
              {purchaseError && <p className="deck-picker__empty">{purchaseError}</p>}
            </div>
          </div>
        )}

        {grantedCards && (
          <>
            <div
              className="pack-reveal"
              role="status"
              aria-live="polite"
              aria-label={`Revealing Founders Set: ${revealedCount} of ${grantedCards.length} cards shown`}
            >
              {grantedCards.map((card, i) => (
                <div key={`${card.templateId}-${i}`} className="pack-reveal__slot">
                  {i < revealedCount ? (
                    <div className="pack-reveal__card">
                      <CardFace template={CARD_POOL[card.templateId]} size="hand" foil={card.isFoil} conditionGrade={card.conditionGrade} />
                      <span className="pack-reveal__edition-tag">
                        {EDITION_LABEL[card.editionType]} · #{card.serialNumber}
                      </span>
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
              ))}
            </div>
            {revealedCount >= grantedCards.length && (
              <button type="button" className="end-turn-btn" onClick={() => setGrantedCards(null)}>
                Continue
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
