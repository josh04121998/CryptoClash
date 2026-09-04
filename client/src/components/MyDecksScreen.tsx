import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export interface SavedDeck {
  id: string;
  name: string;
  cards: string[];
}

export interface MyDecksScreenProps {
  token: string;
  onBack: () => void;
  onCreateNew: () => void;
  onEdit: (deck: SavedDeck) => void;
}

export function MyDecksScreen({ token, onBack, onCreateNew, onEdit }: MyDecksScreenProps) {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    apiFetch<{ decks: SavedDeck[] }>("/api/decks", { token })
      .then((res) => setDecks(res.decks))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  async function remove(id: string) {
    try {
      await apiFetch(`/api/decks/${id}`, { method: "DELETE", token });
      setDecks((d) => d.filter((deck) => deck.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">my decks</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onCreateNew}>
            New Deck
          </button>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>
      <main className="deck-picker">
        {loading && <p className="deck-picker__prompt">Loading…</p>}
        {error && <p className="deck-picker__empty">{error}</p>}
        {!loading && decks.length === 0 && !error && (
          <p className="deck-picker__empty">No saved decks yet — build one to get started.</p>
        )}
        <div className="deck-picker__grid">
          {decks.map((deck) => (
            <div key={deck.id} className="deck-picker__card">
              <span className="deck-picker__card-title">{deck.name}</span>
              <span className="deck-picker__card-desc">{deck.cards.length} cards</span>
              <div className="deck-picker__card-actions">
                <button type="button" onClick={() => onEdit(deck)}>
                  Edit
                </button>
                <button type="button" onClick={() => remove(deck.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
