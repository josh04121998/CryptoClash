import { DECKS } from "@cryptoclash/engine";
import { factionColor } from "../factionColor.js";

export interface DeckPickerProps {
  title: string;
  onPick: (deckId: string) => void;
  onBack: () => void;
}

export function DeckPicker({ title, onPick, onBack }: DeckPickerProps) {
  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">{title}</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>
      <main className="deck-picker">
        <p className="deck-picker__prompt">Choose a deck.</p>
        <div className="deck-picker__grid">
          {DECKS.map((deck) => (
            <button
              key={deck.id}
              type="button"
              className="deck-picker__card"
              style={{ borderColor: factionColor(deck.faction) }}
              onClick={() => onPick(deck.id)}
            >
              <span className="deck-picker__card-title" style={{ color: factionColor(deck.faction) }}>
                {deck.name}
              </span>
              <span className="deck-picker__card-desc">{deck.description}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
