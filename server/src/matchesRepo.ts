import type { Pool } from "pg";
import { CARD_POOL, Faction, PlayerId } from "@cryptoclash/engine";

/**
 * Durable match records — the write side of `0014_matches.sql`. Read that
 * migration's header first: it carries the full reasoning for the table's
 * shape (one row per match with A_/B_ seat columns, not one row per seat) and
 * for every column. The documented read-side queries live in
 * `server/sql/match_balance.sql`.
 *
 * Play Online only. Play vs AI runs entirely client-side and never reaches
 * `matchRoom.ts`, so it can never be recorded here — see the migration header.
 *
 * Best-effort, exactly like every other write `matchRoom.ts` fires at the end
 * of a match (`awardMatchResult`, `recordQuestProgress`, `awardRankPoints`):
 * the caller does `.catch(() => {})` and nothing retries or notices a failure.
 * A telemetry write must never crash a match or change its outcome.
 */

/**
 * How a match ended. Three genuinely different events, kept apart because
 * averaging them together makes every number meaningless:
 * - `conclusion` — the engine decided it (HP to 0, fatigue, mutual lethal).
 * - `forfeit`    — a deliberate "Leave" click, no grace period.
 * - `abandon`    — a dropped socket whose reconnect grace period lapsed.
 */
export type MatchEndReason = "conclusion" | "forfeit" | "abandon";

export interface MatchSeatRecord {
  /** null for anonymous play (no wallet linked) — the common case, not an edge one. */
  accountId: string | null;
  faction: Faction;
  /** How many of this seat's 30 cards belong to `faction` — see the migration's `a_faction_cards`. */
  factionCards: number;
  /** Final player HP. Starts at 30 and is not clamped — a losing seat is usually negative (overkill). */
  hp: number;
}

export interface MatchRecord {
  winner: PlayerId | "Draw";
  endReason: MatchEndReason;
  turns: number;
  durationMs: number;
  startedAt: Date;
  seats: Record<PlayerId, MatchSeatRecord>;
}

/**
 * Fixed tie-break order for `deckFaction` below. Only used when a deck splits
 * its non-Neutral cards evenly between two factions, which no pre-built deck
 * does — it exists purely so the label is deterministic (the same deck always
 * records the same faction) rather than dependent on card id iteration order.
 */
const FACTION_ORDER: Faction[] = ["Doggos", "Frogs", "Apes", "Bulls", "Bears", "Cats"];

/**
 * The deck's archetype, derived from the 30 card ids the seat actually played
 * with: the faction holding a plurality of its non-Neutral cards, plus how
 * many cards that is.
 *
 * Derived rather than taken from anywhere else on purpose. The client never
 * sends a faction (and couldn't be trusted with one — nothing a client claims
 * about its own deck is trusted, see `createMatchServer.ts`'s re-validation),
 * and `accounts.starting_faction` (0009) is the one-time free-collection
 * choice, which says nothing about the deck brought to *this* match.
 *
 * Neutral cards are excluded from the count because every faction's pre-built
 * deck contains Neutral staples (Sharpening Stone, Rocket Boots) — counting
 * them would just add the same constant to every faction. A deck with no
 * non-Neutral cards at all is legitimately `Neutral` with a count of 0.
 * Unknown ids (a card retired between the match and this query) are ignored
 * rather than throwing: this path must never fail the caller.
 */
export function deckFaction(cards: string[]): { faction: Faction; cardCount: number } {
  const counts = new Map<Faction, number>();
  for (const cardId of cards) {
    const faction = CARD_POOL[cardId]?.faction;
    if (!faction || faction === "Neutral") continue;
    counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }
  let best: Faction = "Neutral";
  let bestCount = 0;
  for (const faction of FACTION_ORDER) {
    const count = counts.get(faction) ?? 0;
    if (count > bestCount) {
      best = faction;
      bestCount = count;
    }
  }
  return { faction: best, cardCount: bestCount };
}

/**
 * Inserts the one row for a finished match. A single statement, so the record
 * is atomically all-or-nothing even though nothing retries it — see the
 * migration header's point 1 for why that drove the table's shape.
 *
 * Callers are responsible for firing this exactly once per match (see
 * `MatchRoom`'s `recorded` flag); this function has no idempotency of its own
 * and would happily insert a duplicate row if called twice.
 */
export async function recordMatch(pool: Pool, record: MatchRecord): Promise<void> {
  const a = record.seats.A;
  const b = record.seats.B;
  await pool.query(
    `insert into matches (
       winner, end_reason, turns, duration_ms,
       a_account_id, b_account_id,
       a_faction, b_faction,
       a_faction_cards, b_faction_cards,
       a_hp, b_hp,
       started_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      record.winner,
      record.endReason,
      record.turns,
      record.durationMs,
      a.accountId,
      b.accountId,
      a.faction,
      b.faction,
      a.factionCards,
      b.factionCards,
      a.hp,
      b.hp,
      record.startedAt,
    ],
  );
}
