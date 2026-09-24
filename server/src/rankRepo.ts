import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./ledger.js";
import { withTransaction } from "./txHelper.js";

/**
 * Ranked progression (spec.md Section 21's "Ranked progression") — deliberately scoped to just
 * the progression/*display* layer: a rank tier derived from real match performance, credited on
 * the same server-validated match-result event Coins/quests/achievements already trust. This is
 * NOT skill-based matchmaking — matches are still FIFO-queued (matchRoom.ts /
 * architecture.md Section 5); pairing players by rank/points is a separate, larger roadmap item
 * (STATUS.md Section 5's "known limitations" already tracks it) and is deliberately not
 * attempted here.
 *
 * An append-only points ledger (rank_points_transactions) — same "append-only, derive the
 * current value by summing" posture as leaderboardRepo.ts's read-side aggregation over
 * coin_transactions, but a *separate* table rather than a reuse of it: rank points and Coins
 * move independently (a loss still earns some Coins per coinsRepo.ts but *costs* rank points
 * here), so there's no single "amount" column that means the same thing for both ledgers.
 *
 * No seasons/resets — points accumulate forever. Whether/how often to reset a season (and
 * whether a season awards its own end-of-season Coins/cosmetic) is a real product decision, not
 * guessed at here; flagged in the session report as needing one before this goes further.
 */
export type MatchOutcomeForRank = "win" | "loss" | "draw";

/** Placeholder point deltas per match result — first design pass, not tuned against real play
 * data (same caveat as every other economy constant in this codebase). A loss costs points
 * (unlike Coins, which pays out something on every result) because a rank ladder where losing
 * never costs anything isn't really a ladder. */
export const WIN_RANK_POINTS = 20;
export const LOSS_RANK_POINTS = -10;
export const DRAW_RANK_POINTS = 5;

const RANK_REASON: Record<MatchOutcomeForRank, string> = { win: "match_win", loss: "match_loss", draw: "match_draw" };

function pointsForOutcome(outcome: MatchOutcomeForRank): number {
  switch (outcome) {
    case "win":
      return WIN_RANK_POINTS;
    case "loss":
      return LOSS_RANK_POINTS;
    case "draw":
      return DRAW_RANK_POINTS;
  }
}

export interface RankTier {
  name: string;
  minPoints: number;
}

/**
 * Tier thresholds — Bronze/Silver/Gold/Platinum/Diamond, a familiar ladder shape borrowed the
 * same way craftingRepo.ts anchored Dust values to Hearthstone's disenchant economy.
 *
 * Retuned 2026-09-24 (session 34), a reasoned pass with no play data yet: at the original
 * spacing (0/150/400/800/1500) a ~50%-win-rate player nets only ~+5 points/game on average
 * (WIN_RANK_POINTS/LOSS_RANK_POINTS/DRAW_RANK_POINTS below), which worked out to roughly 30
 * games just to reach Silver — the *first* of five tiers. Flattened Silver/Gold so a median
 * player sees real movement early (Bronze→Silver in ~3 wins, Silver→Gold in ~7 more);
 * Platinum/Diamond are untouched and stay the genuine, engaged-player-only climb. Still a first
 * pass — revisit once `npm run report --workspace=server` shows a real ranked-play distribution.
 */
export const RANK_TIERS: RankTier[] = [
  { name: "Bronze", minPoints: 0 },
  { name: "Silver", minPoints: 60 },
  { name: "Gold", minPoints: 200 },
  { name: "Platinum", minPoints: 800 },
  { name: "Diamond", minPoints: 1500 },
];

export function tierForPoints(points: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (points >= t.minPoints) tier = t;
  }
  return tier;
}

/**
 * One-time Coins reward the first time an account's points cross into a tier (session 34) —
 * every other progression system here (quests, dailies, weeklies, achievements) pays Coins;
 * ranked was the one flagged exception. Bronze is deliberately absent: it's where every account
 * starts, so "first reached" doesn't mean anything for it. Roughly scaled to the achievement
 * rewards below it in ambition (achievementsRepo.ts's win_10=300/win_50=1000) — Diamond, the
 * genuine top-tier grail, pays the most of anything in the game's earn economy on purpose.
 */
export const RANK_TIER_REWARDS: Partial<Record<string, number>> = {
  Silver: 150,
  Gold: 300,
  Platinum: 600,
  Diamond: 1200,
};

/**
 * Called once per Play Online match, per participant with a real account (matchRoom.ts) — same
 * best-effort posture as recordQuestProgress/recordAchievementProgress: a failure here should
 * never crash a match or block the Coins award.
 *
 * Also awards any newly-crossed tier's one-time Coins bonus, in the same transaction as the
 * points insert — not a separate follow-up call, so there's no window where a crash between the
 * two could record the tier crossing without ever paying for it (or vice versa). `tierForPoints`
 * is checked against every reward-eligible tier at or below the new total, not just the one
 * tier just crossed, so an account that somehow jumps more than one tier in a single match
 * (unlikely at today's point deltas, but not impossible after a future retune) still gets paid
 * for all of them — `on conflict do nothing` makes any tier it already holds a no-op.
 */
export async function awardRankPoints(pool: Pool, accountId: string, outcome: MatchOutcomeForRank): Promise<void> {
  const amount = pointsForOutcome(outcome);
  await withTransaction(pool, async (client) => {
    await client.query("insert into rank_points_transactions (account_id, amount, reason) values ($1, $2, $3)", [
      accountId,
      amount,
      RANK_REASON[outcome],
    ]);

    const totalResult = await client.query<{ total: string }>(
      "select coalesce(sum(amount), 0)::int as total from rank_points_transactions where account_id = $1",
      [accountId],
    );
    const total = Math.max(Number(totalResult.rows[0].total), 0);

    for (const tier of RANK_TIERS) {
      const reward = RANK_TIER_REWARDS[tier.name];
      if (reward === undefined || total < tier.minPoints) continue;
      const inserted = await client.query(
        "insert into rank_tier_rewards (account_id, tier_name, coins_awarded) values ($1, $2, $3) on conflict do nothing returning tier_name",
        [accountId, tier.name, reward],
      );
      if (inserted.rowCount) {
        await applyCoinDeltaOnClient(client, accountId, reward, `rank_tier:${tier.name}`);
      }
    }
  });
}

export interface RankStatus {
  points: number;
  tier: RankTier;
  nextTier: RankTier | null;
  pointsToNextTier: number | null;
  /** null for an account with no ranked match history yet — not on the leaderboard at all, same "below threshold" shape leaderboardRepo.ts's getMyWinRate uses. */
  rank: number | null;
}

/** An account's own tier/points/leaderboard position in one query — the personal-progress read
 * behind both GET /api/rank and the "mine" line of GET /api/leaderboard/rank. */
export async function getMyRank(pool: Pool, accountId: string): Promise<RankStatus> {
  const result = await pool.query<{ points: number; rank: string }>(
    `select points, rank from (
       select account_id, greatest(sum(amount)::int, 0) as points, rank() over (order by sum(amount) desc) as rank
       from rank_points_transactions
       group by account_id
     ) ranked
     where account_id = $1`,
    [accountId],
  );
  const row = result.rows[0];
  const points = row ? row.points : 0;
  const tier = tierForPoints(points);
  const tierIndex = RANK_TIERS.indexOf(tier);
  const nextTier = RANK_TIERS[tierIndex + 1] ?? null;
  return {
    points,
    tier,
    nextTier,
    pointsToNextTier: nextTier ? nextTier.minPoints - points : null,
    rank: row ? Number(row.rank) : null,
  };
}

const RANK_LEADERBOARD_LIMIT = 20;

export interface RankLeaderboardEntry {
  walletAddress: string;
  points: number;
  tierName: string;
  rank: number;
}

/** Public top-N board (leaderboardRepo.ts's existing pattern — public to view, no wallet
 * required, same "no login wall to look" principle). Only ranks accounts with at least one real
 * ranked match result — no zero-point placeholder rows. */
export async function getTopRank(pool: Pool, limit = RANK_LEADERBOARD_LIMIT): Promise<RankLeaderboardEntry[]> {
  const result = await pool.query<{ wallet_address: string; points: number; rank: string }>(
    `select a.wallet_address, ranked.points, ranked.rank
     from (
       select account_id, greatest(sum(amount)::int, 0) as points, rank() over (order by sum(amount) desc) as rank
       from rank_points_transactions
       group by account_id
     ) ranked
     join accounts a on a.id = ranked.account_id
     order by ranked.rank
     limit $1`,
    [limit],
  );
  return result.rows.map((r) => ({
    walletAddress: r.wallet_address,
    points: r.points,
    tierName: tierForPoints(r.points).name,
    rank: Number(r.rank),
  }));
}
