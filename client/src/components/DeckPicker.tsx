import { DECKS } from "@cryptoclash/engine";
import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";
import { factionColor } from "../factionColor.js";

interface SavedDeck {
  id: string;
  name: string;
  cards: string[];
}

export interface DeckPickerProps {
  title: string;
  /** Signed-in session token, if a wallet is connected — enables the "My Decks" section. */
  token: string | null;
  onPick: (cards: string[]) => void;
  onBack: () => void;
}

export function DeckPicker({ title, token, onPick, onBack }: DeckPickerProps) {
  const [myDecks, setMyDecks] = useState<SavedDeck[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ decks: SavedDeck[] }>("/api/decks", { token })
      .then((res) => setMyDecks(res.decks))
      .catch((e) => setLoadError((e as Error).message));
  }, [token]);

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
        {token && (
          <>
            <p className="deck-picker__prompt">My Decks</p>
            <div className="deck-picker__grid">
              {myDecks.length === 0 && !loadError && (
                <p className="deck-picker__empty">No saved decks yet — build one from the main menu.</p>
              )}
              {loadError && <p className="deck-picker__empty">Couldn't load your decks: {loadError}</p>}
              {myDecks.map((deck) => (
                <button key={deck.id} type="button" className="deck-picker__card" onClick={() => onPick(deck.cards)}>
                  <span className="deck-picker__card-title">{deck.name}</span>
                  <span className="deck-picker__card-desc">{deck.cards.length} cards</span>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="deck-picker__prompt">Starter Decks</p>
        <div className="deck-picker__grid">
          {DECKS.map((deck) => (
            <button
              key={deck.id}
              type="button"
              className="deck-picker__card"
              style={{ borderColor: factionColor(deck.faction) }}
              onClick={() => onPick(deck.cards)}
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
