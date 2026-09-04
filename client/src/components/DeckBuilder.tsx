import { CARD_POOL, CardTemplate, DECK_SIZE, MAX_COPIES_PER_CARD, validateDeck } from "@cryptoclash/engine";
import { useMemo, useState } from "react";
import { apiFetch } from "../api.js";
import { CardFace } from "./CardFace.js";

export interface DeckBuilderProps {
  token: string;
  /** Editing an existing saved deck, or undefined for a new one. */
  existing?: { id: string; name: string; cards: string[] };
  onSaved: () => void;
  onCancel: () => void;
}

const POOL_CARDS: CardTemplate[] = Object.values(CARD_POOL)
  .filter((t) => !t.token)
  .sort((a, b) => (a.faction === b.faction ? a.cost - b.cost : a.faction.localeCompare(b.faction)));

export function DeckBuilder({ token, existing, onSaved, onCancel }: DeckBuilderProps) {
  const [name, setName] = useState(existing?.name ?? "New Deck");
  const [cards, setCards] = useState<string[]>(existing?.cards ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of cards) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [cards]);

  const errors = useMemo(() => validateDeck(cards), [cards]);
  const isLegal = errors.length === 0;

  function addCard(id: string) {
    if (cards.length >= DECK_SIZE) return;
    if ((counts.get(id) ?? 0) >= MAX_COPIES_PER_CARD) return;
    setCards((c) => [...c, id]);
  }

  function removeCard(id: string) {
    const idx = cards.lastIndexOf(id);
    if (idx === -1) return;
    setCards((c) => c.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!isLegal) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (existing) {
        await apiFetch(`/api/decks/${existing.id}`, { method: "PUT", token, body: JSON.stringify({ name, cards }) });
      } else {
        await apiFetch("/api/decks", { method: "POST", token, body: JSON.stringify({ name, cards }) });
      }
      onSaved();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const deckEntries = Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">deck builder</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </header>

      <main className="deck-builder">
        <div className="deck-builder__pool">
          {POOL_CARDS.map((template) => {
            const owned = counts.get(template.id) ?? 0;
            const atCopyLimit = owned >= MAX_COPIES_PER_CARD;
            const deckFull = cards.length >= DECK_SIZE;
            return (
              <div key={template.id} className="deck-builder__pool-card">
                <CardFace template={template} keywords={template.keywords} size="hand" onClick={() => addCard(template.id)} />
                <span className="deck-builder__pool-count">
                  {owned}/{MAX_COPIES_PER_CARD}
                </span>
                <button type="button" disabled={atCopyLimit || deckFull} onClick={() => addCard(template.id)}>
                  Add
                </button>
              </div>
            );
          })}
        </div>

        <aside className="deck-builder__sidebar">
          <input
            className="deck-builder__name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Deck name"
          />
          <div className={`deck-builder__count ${isLegal ? "deck-builder__count--legal" : ""}`}>
            {cards.length} / {DECK_SIZE}
          </div>

          <div className="deck-builder__list">
            {deckEntries.length === 0 && <p className="deck-builder__empty">Add cards from the pool to build your deck.</p>}
            {deckEntries.map(([id, count]) => (
              <div key={id} className="deck-builder__list-row">
                <span>
                  {count}× {CARD_POOL[id].name}
                </span>
                <button type="button" onClick={() => removeCard(id)}>
                  −
                </button>
              </div>
            ))}
          </div>

          {errors.length > 0 && (
            <ul className="deck-builder__errors">
              {errors.slice(0, 3).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {saveError && <p className="deck-builder__errors">{saveError}</p>}

          <button type="button" className="end-turn-btn" disabled={!isLegal || saving} onClick={save}>
            {saving ? "Saving…" : "Save Deck"}
          </button>
        </aside>
      </main>
    </div>
  );
}
