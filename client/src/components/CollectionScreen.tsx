import { CARD_POOL, CardTemplate, Faction, Rarity } from "@cryptoclash/engine";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api.js";
import { rarityColor } from "../rarityColor.js";
import { CardFace } from "./CardFace.js";

export interface CollectionScreenProps {
  token: string;
  onBack: () => void;
}

const ALL_CARDS: CardTemplate[] = Object.values(CARD_POOL)
  .filter((t) => !t.token)
  .sort((a, b) => (a.faction === b.faction ? a.cost - b.cost : a.faction.localeCompare(b.faction)));

const FACTIONS: Faction[] = Array.from(new Set(ALL_CARDS.map((t) => t.faction))).sort();

// In pool order (Common → Genesis), not alphabetical, so the summary bar reads as a ladder.
const RARITY_ORDER: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Genesis"];

type FactionFilter = Faction | "All";
type RarityFilter = Rarity | "All";

/**
 * The "digital binder" view (spec.md Section 19). Editions/foils/serials
 * (Section 19's "First Editions", "Foils", "Serialised cards") aren't shown
 * as separate filters yet — nothing populates card_instances with anything
 * but the standard edition today (see STATUS.md), so those fields exist in
 * the schema but have no real data behind them yet. This screen shows what's
 * actually real: owned vs. missing, by faction and rarity.
 */
export function CollectionScreen({ token, onBack }: CollectionScreenProps) {
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [factionFilter, setFactionFilter] = useState<FactionFilter>("All");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("All");
  const [ownedOnly, setOwnedOnly] = useState(false);

  useEffect(() => {
    apiFetch<{ owned: Record<string, number> }>("/api/collection", { token })
      .then((res) => setOwned(res.owned))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  const rarityStats = useMemo(
    () =>
      RARITY_ORDER.map((rarity) => {
        const templates = ALL_CARDS.filter((t) => t.rarity === rarity);
        return { rarity, owned: templates.filter((t) => (owned[t.id] ?? 0) > 0).length, total: templates.length };
      }).filter((s) => s.total > 0),
    [owned],
  );

  const totalOwned = useMemo(() => ALL_CARDS.filter((t) => (owned[t.id] ?? 0) > 0).length, [owned]);

  const visibleCards = useMemo(
    () =>
      ALL_CARDS.filter((t) => {
        if (factionFilter !== "All" && t.faction !== factionFilter) return false;
        if (rarityFilter !== "All" && t.rarity !== rarityFilter) return false;
        if (ownedOnly && (owned[t.id] ?? 0) === 0) return false;
        return true;
      }),
    [factionFilter, rarityFilter, ownedOnly, owned],
  );

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">collection</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="collection">
        {error && <p className="deck-picker__empty">Couldn't load your collection: {error}</p>}
        {loading && <p className="deck-picker__prompt">Loading…</p>}

        {!loading && !error && (
          <>
            <div className="collection__summary">
              <span className="collection__summary-total">
                {totalOwned} / {ALL_CARDS.length} cards owned
              </span>
              <div className="collection__summary-rarities">
                {rarityStats.map((s) => (
                  <span key={s.rarity} className="collection__summary-pill" style={{ color: rarityColor(s.rarity) }}>
                    {s.rarity} {s.owned}/{s.total}
                  </span>
                ))}
              </div>
            </div>

            <div className="collection__filters">
              <select value={factionFilter} onChange={(e) => setFactionFilter(e.target.value as FactionFilter)}>
                <option value="All">All Factions</option>
                {FACTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}>
                <option value="All">All Rarities</option>
                {rarityStats.map((s) => (
                  <option key={s.rarity} value={s.rarity}>
                    {s.rarity}
                  </option>
                ))}
              </select>
              <label className="collection__toggle">
                <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />
                Owned only
              </label>
            </div>

            <div className="collection__grid">
              {visibleCards.map((template) => {
                const count = owned[template.id] ?? 0;
                return (
                  <div key={template.id} className="collection__card">
                    <CardFace template={template} size="hand" dimmed={count === 0} />
                    <span className="collection__count">{count === 0 ? "Not owned" : `${count} owned`}</span>
                  </div>
                );
              })}
              {visibleCards.length === 0 && <p className="deck-picker__empty">No cards match these filters.</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
