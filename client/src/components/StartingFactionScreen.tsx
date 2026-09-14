import { DECKS } from "@cryptoclash/engine";
import { Faction } from "@cryptoclash/engine";
import { useState } from "react";
import { factionColor } from "../factionColor.js";

export interface StartingFactionScreenProps {
  onChoose: (faction: Faction) => Promise<void>;
  /** A real escape hatch — this screen previously had none at all, a dead end for anyone who opened
   * a wallet-gated screen before meaning to commit to a permanent faction choice. */
  onBack: () => void;
  onHome: () => void;
}

/**
 * The one-time "must be earned, like Hearthstone" onboarding moment
 * (STATUS.md roadmap item 1) — a wallet-connected account's free starting
 * collection is now one chosen faction's Commons (plus every Neutral
 * Common) instead of every faction's, so this choice actually matters and
 * can't be undone (setStartingFaction 409s on a repeat). Deliberately a
 * select-then-confirm flow, not a single click per faction card — this is
 * the one irreversible choice in the whole onboarding path.
 */
export function StartingFactionScreen({ onChoose, onBack, onHome }: StartingFactionScreenProps) {
  const [selected, setSelected] = useState<Faction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onChoose(selected);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <button type="button" className="app-bar__logo-btn" onClick={onHome} title="Back to landing">
          <h1>FLOORWARS</h1>
        </button>
        <span className="app-bar__subtitle">choose your faction</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>
      <main className="deck-picker">
        <p className="deck-picker__prompt">
          Pick one faction — you'll get a full free set of its Common cards (plus every Neutral card) to build with
          right away. Everything else, including every other faction, is earned through packs and crafting.
          <strong> This choice is permanent.</strong>
        </p>
        {error && <p className="deck-picker__empty" role="status" aria-live="polite">{error}</p>}
        <div className="deck-picker__grid" role="radiogroup" aria-label="Starting faction">
          {DECKS.map((deck) => {
            const isSelected = selected === deck.faction;
            return (
              <button
                key={deck.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`deck-picker__card${isSelected ? " deck-picker__card--selected" : ""}`}
                style={{ borderColor: factionColor(deck.faction) }}
                disabled={busy}
                onClick={() => setSelected(deck.faction)}
              >
                <span className="deck-picker__card-title" style={{ color: factionColor(deck.faction) }}>
                  {deck.name}
                </span>
                <span className="deck-picker__card-desc">{deck.description}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="starting-faction__confirm" disabled={!selected || busy} onClick={confirm}>
          {busy ? "Choosing…" : selected ? `Confirm ${selected} — permanent` : "Pick a faction above"}
        </button>
      </main>
    </div>
  );
}
