import { CARD_POOL } from "./cards.js";

/** batlleSpec.md Section 2: every deck is exactly 30 cards. */
export const DECK_SIZE = 30;

/** No rule in spec.md pins this number; 3 is the max used by every pre-built deck in cards.ts — kept as the one consistent convention. */
export const MAX_COPIES_PER_CARD = 3;

/**
 * Validates a prospective deck list against the pool: unknown ids, tokens
 * (summon-only, never deck-legal), over-the-copy-limit cards, and the exact
 * size requirement. Returns a list of human-readable problems — empty means
 * legal. Pure and DB-free so both the client's deck builder and the server's
 * save-deck endpoint can share the exact same rule.
 */
export function validateDeck(cards: string[]): string[] {
  const errors: string[] = [];
  const counts = new Map<string, number>();

  for (const id of cards) {
    const template = CARD_POOL[id];
    if (!template) {
      errors.push(`Unknown card id: ${id}`);
      continue;
    }
    if (template.token) {
      errors.push(`${template.name} is a token — it can't be included in a deck.`);
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    if (count > MAX_COPIES_PER_CARD) {
      errors.push(`${CARD_POOL[id].name}: ${count} copies (max ${MAX_COPIES_PER_CARD}).`);
    }
  }

  if (cards.length !== DECK_SIZE) {
    errors.push(`Deck has ${cards.length} cards (must be exactly ${DECK_SIZE}).`);
  }

  return errors;
}
