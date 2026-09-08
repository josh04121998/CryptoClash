import type { Pool } from "pg";
import { MATCH_REASON, MATCH_REASONS } from "./coinsRepo.js";

/**
 * Pure read-side aggregation over the existing coin_transactions audit log
 * (session 5's match_win/match_loss/match_draw reasons, and every positive
 * credit for coinsEarned) — deliberately no new "wins"/"losses" columns or a
 * cached leaderboard table. At this project's scale a `group by` over
 * coin_transactions is cheap and can never drift from the ledger it's reading
 * (the usual risk with a denormalized counter); revisit only if this table
 * gets large enough for that scan to actually show up in latency.
 */
export const LEADERBOARD_LIMIT = 20;

/**
 * A 1-0 record shouldn't top the win-rate board over someone 40-10 — this is
 * the same "guard against a tiny sample" reasoning as Hearthstone-style
 * ladder systems requiring placement games. First-pass number, not tuned
 * against real play data (same caveat as every other economy constant in
 * this codebase).
 */
export const MIN_GAMES_FOR_WIN_RATE = 5;

export interface RankedEntry {
  walletAddress: string;
  rank: number;
}

export interface WinsEntry extends RankedEntry {
  wins: number;
}

export interface CoinsEarnedEntry extends RankedEntry {
  coinsEarned: number;
}

export interface WinRateEntry extends RankedEntry {
  wins: number;
  games: number;
  winRate: number;
}

export async function getTopWins(pool: Pool, limit = LEADERBOARD_LIMIT): Promise<WinsEntry[]> {
  const result = await pool.query<{ wallet_address: string; wins: number; rank: string }>(
    `select a.wallet_address, ranked.wins, ranked.rank
     from (
       select account_id, count(*)::int as wins, rank() over (order by count(*) desc) as rank
       from coin_transactions
       where reason = $2
       group by account_id
     ) ranked
     join accounts a on a.id = ranked.account_id
     order by ranked.rank
     limit $1`,
    [limit, MATCH_REASON.win],
  );
  return result.rows.map((r) => ({ walletAddress: r.wallet_address, wins: r.wins, rank: Number(r.rank) }));
}

export async function getMyWins(pool: Pool, accountId: string): Promise<{ wins: number; rank: number | null }> {
  const result = await pool.query<{ wins: number; rank: string }>(
    `select wins, rank from (
       select account_id, count(*)::int as wins, rank() over (order by count(*) desc) as rank
       from coin_transactions
       where reason = $2
       group by account_id
     ) ranked
     where account_id = $1`,
    [accountId, MATCH_REASON.win],
  );
  const row = result.rows[0];
  return row ? { wins: row.wins, rank: Number(row.rank) } : { wins: 0, rank: null };
}

export async function getTopCoinsEarned(pool: Pool, limit = LEADERBOARD_LIMIT): Promise<CoinsEarnedEntry[]> {
  const result = await pool.query<{ wallet_address: string; earned: number; rank: string }>(
    `select a.wallet_address, ranked.earned, ranked.rank
     from (
       select account_id, sum(amount)::int as earned, rank() over (order by sum(amount) desc) as rank
       from coin_transactions
       where amount > 0
       group by account_id
     ) ranked
     join accounts a on a.id = ranked.account_id
     order by ranked.rank
     limit $1`,
    [limit],
  );
  return result.rows.map((r) => ({ walletAddress: r.wallet_address, coinsEarned: r.earned, rank: Number(r.rank) }));
}

export async function getMyCoinsEarned(pool: Pool, accountId: string): Promise<{ coinsEarned: number; rank: number | null }> {
  const result = await pool.query<{ earned: number; rank: string }>(
    `select earned, rank from (
       select account_id, sum(amount)::int as earned, rank() over (order by sum(amount) desc) as rank
       from coin_transactions
       where amount > 0
       group by account_id
     ) ranked
     where account_id = $1`,
    [accountId],
  );
  const row = result.rows[0];
  return row ? { coinsEarned: row.earned, rank: Number(row.rank) } : { coinsEarned: 0, rank: null };
}

export async function getTopWinRate(pool: Pool, limit = LEADERBOARD_LIMIT, minGames = MIN_GAMES_FOR_WIN_RATE): Promise<WinRateEntry[]> {
  const result = await pool.query<{ wallet_address: string; wins: number; games: number; win_rate: string; rank: string }>(
    `select a.wallet_address, ranked.wins, ranked.games, ranked.win_rate, ranked.rank
     from (
       select account_id, wins, games, win_rate, rank() over (order by win_rate desc) as rank
       from (
         select account_id,
                count(*) filter (where reason = $3)::int as wins,
                count(*)::int as games,
                (count(*) filter (where reason = $3))::numeric / count(*) as win_rate
         from coin_transactions
         where reason = any($4::text[])
         group by account_id
         having count(*) >= $2
       ) eligible
     ) ranked
     join accounts a on a.id = ranked.account_id
     order by ranked.rank
     limit $1`,
    [limit, minGames, MATCH_REASON.win, MATCH_REASONS],
  );
  return result.rows.map((r) => ({
    walletAddress: r.wallet_address,
    wins: r.wins,
    games: r.games,
    winRate: Number(r.win_rate),
    rank: Number(r.rank),
  }));
}

export interface MyWinRateStats {
  wins: number;
  games: number;
  winRate: number;
  /** null when `games < minGames` — not yet eligible, same reasoning as the top-N query's `having` clause. */
  rank: number | null;
  minGames: number;
}

export async function getMyWinRate(pool: Pool, accountId: string, minGames = MIN_GAMES_FOR_WIN_RATE): Promise<MyWinRateStats> {
  const raw = await pool.query<{ wins: number; games: number }>(
    `select count(*) filter (where reason = $2)::int as wins, count(*)::int as games
     from coin_transactions
     where account_id = $1 and reason = any($3::text[])`,
    [accountId, MATCH_REASON.win, MATCH_REASONS],
  );
  const wins = raw.rows[0]?.wins ?? 0;
  const games = raw.rows[0]?.games ?? 0;
  const winRate = games > 0 ? wins / games : 0;
  if (games < minGames) return { wins, games, winRate, rank: null, minGames };

  const rankRes = await pool.query<{ rank: string }>(
    `select rank from (
       select account_id, rank() over (order by win_rate desc) as rank
       from (
         select account_id,
                (count(*) filter (where reason = $3))::numeric / count(*) as win_rate
         from coin_transactions
         where reason = any($4::text[])
         group by account_id
         having count(*) >= $2
       ) eligible
     ) ranked
     where account_id = $1`,
    [accountId, minGames, MATCH_REASON.win, MATCH_REASONS],
  );
  const rank = rankRes.rows[0] ? Number(rankRes.rows[0].rank) : null;
  return { wins, games, winRate, rank, minGames };
}
