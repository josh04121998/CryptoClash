import { CARD_POOL, Rarity } from "@cryptoclash/engine";
import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";
import { playRevealSound } from "../sound.js";
import { CardFace } from "./CardFace.js";

const EXCITING_RARITIES: ReadonlySet<Rarity> = new Set(["Rare", "Epic", "Legendary", "Mythic", "Genesis"]);

interface PackDefinition {
  id: string;
  name: string;
  cost: number;
  cardCount: number;
}

interface PackCard {
  templateId: string;
  isFoil: boolean;
}

export interface PacksScreenProps {
  token: string;
  balance: number | null;
  onBalanceChange: (balance: number) => void;
  onBack: () => void;
}

const REVEAL_STEP_MS = 350;

export function PacksScreen({ token, balance, onBalanceChange, onBack }: PacksScreenProps) {
  const [packs, setPacks] = useState<PackDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [revealedCards, setRevealedCards] = useState<PackCard[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    apiFetch<{ packs: PackDefinition[] }>("/api/packs")
      .then((res) => setPacks(res.packs))
      .catch((e) => setError((e as Error).message));
  }, []);

  async function open(packType: string) {
    setError(null);
    setOpening(true);
    try {
      const result = await apiFetch<{ cards: PackCard[]; balance: number }>("/api/packs/open", {
        method: "POST",
        token,
        body: JSON.stringify({ packType }),
      });
      onBalanceChange(result.balance);
      setRevealedCards(result.cards);
      setRevealedCount(0);
      // Reveal one card at a time rather than dumping the whole pack at once —
      // spec.md Section 17 calls this "one of the game's signature moments".
      result.cards.forEach((card, i) => {
        setTimeout(() => {
          setRevealedCount((c) => Math.max(c, i + 1));
          const rarity = CARD_POOL[card.templateId].rarity;
          playRevealSound(card.isFoil || (rarity !== undefined && EXCITING_RARITIES.has(rarity)));
        }, REVEAL_STEP_MS * (i + 1));
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">packs</span>
        <div className="app-bar__actions">
          <span className="app-bar__coins" title="Coins">
            🪙 {balance ?? "…"}
          </span>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="packs-screen">
        {error && <p className="deck-picker__empty">{error}</p>}

        {!revealedCards && (
          <div className="deck-picker__grid">
            {packs.map((pack) => {
              const affordable = balance !== null && balance >= pack.cost;
              return (
                <div key={pack.id} className="deck-picker__card">
                  <span className="deck-picker__card-title">{pack.name}</span>
                  <span className="deck-picker__card-desc">
                    {pack.cardCount} cards · {pack.cost} Coins
                  </span>
                  <button type="button" disabled={!affordable || opening} onClick={() => open(pack.id)}>
                    {opening ? "Opening…" : affordable ? "Open" : "Not enough Coins"}
                  </button>
                </div>
              );
            })}
            {packs.length === 0 && !error && <p className="deck-picker__empty">Loading packs…</p>}
          </div>
        )}

        {revealedCards && (
          <>
            <div className="pack-reveal">
              {revealedCards.map((card, i) => (
                <div key={`${card.templateId}-${i}`} className="pack-reveal__slot">
                  {i < revealedCount ? (
                    <div className="pack-reveal__card">
                      <CardFace template={CARD_POOL[card.templateId]} size="hand" foil={card.isFoil} />
                      {card.isFoil && <span className="pack-reveal__foil-tag">✨ Foil</span>}
                    </div>
                  ) : (
                    <div className="pack-reveal__back" />
                  )}
                </div>
              ))}
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
