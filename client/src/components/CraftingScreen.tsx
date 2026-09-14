import { CARD_POOL, CardTemplate, Faction, Rarity } from "@cryptoclash/engine";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api.js";
import { rarityColor } from "../rarityColor.js";
import { playRevealSound, playRewardSound } from "../sound.js";
import { CardFace } from "./CardFace.js";

export interface CraftingScreenProps {
  token: string;
  /** The account's chosen starting faction — App.tsx never renders this screen until one's chosen, but stays nullable defensively (mirrors craftingRepo.ts's own conservative null handling). */
  startingFaction: Faction | null;
  onBack: () => void;
}

interface CraftRate {
  rarity: Rarity;
  disenchantValue: number;
  craftCost: number;
}

/**
 * Same craft-eligible set as the server's CRAFT_ELIGIBLE_RARITIES
 * (craftingRepo.ts) — Mythic/Genesis are excluded (crafting one would be a
 * backdoor around Genesis's permanently-capped supply). Common used to be
 * excluded outright too; now that the starting grant only covers one chosen
 * faction's Commons plus Neutral's (STATUS.md roadmap item 1), a Common from
 * any *other* faction is real duplicate-protection material — see
 * isFreeStartingCommon below, the same rule craftingRepo.ts enforces
 * server-side (this list is just what the grid shows; the server is the
 * real gate on every request). The actual Dust numbers come from
 * GET /api/craft/rates, not hardcoded here — only which rarities/templates
 * show up in this list is duplicated, and only because there's no template
 * data to derive it from otherwise.
 */
const CRAFT_ELIGIBLE: ReadonlySet<Rarity> = new Set(["Common", "Uncommon", "Rare", "Epic", "Legendary"]);

function isFreeStartingCommon(template: CardTemplate, startingFaction: Faction | null): boolean {
  return template.faction === "Neutral" || startingFaction === null || template.faction === startingFaction;
}

export function CraftingScreen({ token, startingFaction, onBack }: CraftingScreenProps) {
  const CRAFTABLE_CARDS: CardTemplate[] = useMemo(
    () =>
      Object.values(CARD_POOL)
        .filter((t) => !t.token && t.rarity && CRAFT_ELIGIBLE.has(t.rarity))
        .filter((t) => !(t.rarity === "Common" && isFreeStartingCommon(t, startingFaction)))
        .sort((a, b) => (a.rarity === b.rarity ? a.name.localeCompare(b.name) : a.faction.localeCompare(b.faction))),
    [startingFaction],
  );
  const [dust, setDust] = useState<number | null>(null);
  const [rates, setRates] = useState<CraftRate[]>([]);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disenchantQty, setDisenchantQty] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      apiFetch<{ balance: number }>("/api/dust", { token }),
      apiFetch<{ rates: CraftRate[] }>("/api/craft/rates"),
      apiFetch<{ owned: Record<string, number> }>("/api/collection", { token }),
    ])
      .then(([dustRes, ratesRes, collectionRes]) => {
        setDust(dustRes.balance);
        setRates(ratesRes.rates);
        setOwned(collectionRes.owned);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  const rateByRarity = useMemo(() => new Map(rates.map((r) => [r.rarity, r])), [rates]);

  function qtyFor(id: string, ownedCopies: number): number {
    return Math.min(Math.max(1, disenchantQty[id] ?? 1), ownedCopies);
  }

  async function disenchant(template: CardTemplate) {
    const ownedCopies = owned[template.id] ?? 0;
    const count = qtyFor(template.id, ownedCopies);
    if (count < 1) return;
    setBusyId(template.id);
    setActionError(null);
    try {
      const result = await apiFetch<{ dustEarned: number; balance: number }>("/api/craft/disenchant", {
        method: "POST",
        token,
        body: JSON.stringify({ templateId: template.id, count }),
      });
      setDust(result.balance);
      setOwned((o) => ({ ...o, [template.id]: Math.max(0, (o[template.id] ?? 0) - count) }));
      setDisenchantQty((q) => ({ ...q, [template.id]: 1 }));
      playRewardSound();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function craft(template: CardTemplate) {
    setBusyId(template.id);
    setActionError(null);
    try {
      const result = await apiFetch<{ balance: number }>("/api/craft/craft", {
        method: "POST",
        token,
        body: JSON.stringify({ templateId: template.id }),
      });
      setDust(result.balance);
      setOwned((o) => ({ ...o, [template.id]: (o[template.id] ?? 0) + 1 }));
      playRevealSound(true);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>FLOORWARS</h1>
        <span className="app-bar__subtitle">crafting</span>
        <div className="app-bar__actions">
          <span className="app-bar__coins" title="Dust" aria-label={`Dust: ${dust ?? "loading"}`}>
            💠 {dust ?? "…"}
          </span>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="crafting">
        <p className="crafting__intro">
          Disenchant duplicate cards into Dust, then craft the cards you actually want.{" "}
          {startingFaction
            ? `Your ${startingFaction} Commons and every Neutral Common stay free and undisenchantable — everything else, including other factions' Commons, is real crafting material.`
            : "Commons stay free and undisenchantable until you've chosen a starting faction."}
        </p>
        {error && <p className="deck-picker__empty">Couldn't load crafting: {error}</p>}
        {loading && <p className="deck-picker__prompt">Loading…</p>}
        {actionError && (
          <p className="crafting__error" role="status" aria-live="polite">
            {actionError}
          </p>
        )}

        {!loading && !error && (
          <div className="crafting__grid">
            {CRAFTABLE_CARDS.map((template) => {
              const ownedCopies = owned[template.id] ?? 0;
              const rate = rateByRarity.get(template.rarity!);
              const qty = qtyFor(template.id, ownedCopies);
              const busy = busyId === template.id;
              const canCraft = rate !== undefined && dust !== null && dust >= rate.craftCost;
              return (
                <div key={template.id} className="crafting__card">
                  <CardFace template={template} size="hand" dimmed={ownedCopies === 0} />
                  <span
                    className="crafting__rarity-label"
                    style={{ color: rarityColor(template.rarity!) }}
                  >
                    {template.rarity}
                  </span>
                  <span className="crafting__owned">{ownedCopies} owned</span>

                  <div className="crafting__disenchant-row">
                    <input
                      type="number"
                      aria-label={`Quantity of ${template.name} to disenchant`}
                      min={1}
                      max={Math.max(1, ownedCopies)}
                      step={1}
                      value={qty}
                      disabled={ownedCopies === 0 || busy}
                      onChange={(e) =>
                        setDisenchantQty((q) => ({ ...q, [template.id]: Math.round(Number(e.target.value)) || 1 }))
                      }
                    />
                    <button type="button" disabled={ownedCopies === 0 || busy} onClick={() => disenchant(template)}>
                      Disenchant → {rate ? rate.disenchantValue * qty : "…"} 💠
                    </button>
                  </div>

                  <button type="button" disabled={!canCraft || busy} onClick={() => craft(template)}>
                    Craft — {rate?.craftCost ?? "…"} 💠
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
