import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./ledger.js";
import { withTransaction } from "./txHelper.js";

export class AlreadyClaimedThisWeekError extends Error {}

/**
 * A 4-week escalating cycle (spec.md Section 21's "Weekly rewards") — same shape as
 * dailyRepo.ts's DAILY_REWARDS but on a weekly cadence and a shorter table (a week is a much
 * bigger ask than a day, so 4 steps felt right before cycling, rather than reusing 7). Cycles
 * exactly like the daily table: week 5 pays week 1's rate again, not capped. First-pass numbers,
 * not tuned — same caveat as every other economy constant in this codebase.
 */
export const WEEKLY_REWARDS = [300, 450, 650, 1000];

/**
 * ISO-8601 week ("2026-W37", UTC) for `date` — https://en.wikipedia.org/wiki/ISO_week_date.
 * Both getWeeklyStatus/claimWeekly compare this as a plain string, same reasoning
 * dailyRepo.ts's todayUtc()/yesterdayUtc() avoid Postgres `date` columns: `pg` parses `date`
 * into a JS Date by default, reintroducing exactly the local/UTC ambiguity this avoids.
 */
function isoWeekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // move to this ISO week's Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function thisWeekUtc(): string {
  return isoWeekOf(new Date());
}

function lastWeekUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeekOf(d);
}

function rewardForStreak(streak: number): number {
  return WEEKLY_REWARDS[(streak - 1) % WEEKLY_REWARDS.length];
}

interface AccountWeeklyRow {
  last_weekly_claim_week: string | null;
  weekly_streak: number;
}

export interface WeeklyStatus {
  streak: number;
  claimedThisWeek: boolean;
  nextRewardCoins: number;
}

/** What the streak *would become* on a claim right now — used both to preview it and, in claimWeekly, to actually apply it. */
function projectedStreak(row: AccountWeeklyRow | undefined): number {
  if (!row || row.last_weekly_claim_week === null) return 1;
  if (row.last_weekly_claim_week === thisWeekUtc()) return row.weekly_streak; // already claimed this week — no change
  if (row.last_weekly_claim_week === lastWeekUtc()) return row.weekly_streak + 1;
  return 1; // missed a week (or more) — streak resets
}

export async function getWeeklyStatus(pool: Pool, accountId: string): Promise<WeeklyStatus> {
  const result = await pool.query<AccountWeeklyRow>(
    "select last_weekly_claim_week, weekly_streak from accounts where id = $1",
    [accountId],
  );
  const row = result.rows[0];
  const claimedThisWeek = row?.last_weekly_claim_week === thisWeekUtc();
  const streak = claimedThisWeek ? row.weekly_streak : projectedStreak(row);
  return { streak: row?.weekly_streak ?? 0, claimedThisWeek, nextRewardCoins: rewardForStreak(streak) };
}

export interface WeeklyClaimResult {
  coinsEarned: number;
  streak: number;
  balance: number;
}

/**
 * Locks the account row, checks it hasn't already claimed this ISO week, then either extends
 * last week's streak by one or resets to 1 if a week was missed, credits that streak week's
 * Coins, and records this week as the claim week — same lock-then-check-then-write shape as
 * dailyRepo.ts's claimDaily.
 */
export async function claimWeekly(pool: Pool, accountId: string): Promise<WeeklyClaimResult> {
  return withTransaction(pool, async (client) => {
    const result = await client.query<AccountWeeklyRow>(
      "select last_weekly_claim_week, weekly_streak from accounts where id = $1 for update",
      [accountId],
    );
    const row = result.rows[0];
    const week = thisWeekUtc();
    if (row?.last_weekly_claim_week === week) {
      throw new AlreadyClaimedThisWeekError("Already claimed this week's reward.");
    }

    const streak = projectedStreak(row);
    const reward = rewardForStreak(streak);
    const balance = await applyCoinDeltaOnClient(client, accountId, reward, "weekly_login");
    await client.query("update accounts set last_weekly_claim_week = $1, weekly_streak = $2 where id = $3", [week, streak, accountId]);

    return { coinsEarned: reward, streak, balance };
  });
}
