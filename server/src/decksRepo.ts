import type { Pool } from "pg";

export interface Deck {
  id: string;
  accountId: string;
  name: string;
  cards: string[];
  createdAt: string;
  updatedAt: string;
}

interface DeckRow {
  id: string;
  account_id: string;
  name: string;
  cards: string[];
  created_at: string;
  updated_at: string;
}

function fromRow(row: DeckRow): Deck {
  return { id: row.id, accountId: row.account_id, name: row.name, cards: row.cards, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listDecks(pool: Pool, accountId: string): Promise<Deck[]> {
  const result = await pool.query<DeckRow>(
    "select id, account_id, name, cards, created_at, updated_at from decks where account_id = $1 order by created_at asc",
    [accountId],
  );
  return result.rows.map(fromRow);
}

export async function createDeck(pool: Pool, accountId: string, name: string, cards: string[]): Promise<Deck> {
  const result = await pool.query<DeckRow>(
    `insert into decks (account_id, name, cards) values ($1, $2, $3)
     returning id, account_id, name, cards, created_at, updated_at`,
    [accountId, name, JSON.stringify(cards)],
  );
  return fromRow(result.rows[0]);
}

/** Returns null if the deck doesn't exist or belongs to a different account (never leaks that distinction). */
export async function updateDeck(pool: Pool, accountId: string, deckId: string, name: string, cards: string[]): Promise<Deck | null> {
  const result = await pool.query<DeckRow>(
    `update decks set name = $1, cards = $2, updated_at = now()
     where id = $3 and account_id = $4
     returning id, account_id, name, cards, created_at, updated_at`,
    [name, JSON.stringify(cards), deckId, accountId],
  );
  return result.rows.length > 0 ? fromRow(result.rows[0]) : null;
}

export async function deleteDeck(pool: Pool, accountId: string, deckId: string): Promise<boolean> {
  const result = await pool.query("delete from decks where id = $1 and account_id = $2", [deckId, accountId]);
  return (result.rowCount ?? 0) > 0;
}
