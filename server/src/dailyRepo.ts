import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./ledger.js";
import { withTransaction } from "./txHelper.js";

export class AlreadyClaimedTodayError extends Error {}

/**
 * A 7-day escalating cycle (spec.md Section 21's "Daily rewards"), indexed
 * 0-6 for streak days 1-7 — rewards climb through the week and spike on day
 * 7, then the cycle repeats rather than capping the streak outright, so a
 * long streak keeps paying out (day 8 = day 1's rate again) instead of
 * plateauing at day 7 forever. First-pass numbers, not tuned — same caveat as
 * every other economy constant in coinsRepo.ts/packsRepo.ts/craftingRepo.ts.
 */
export const DAILY_REWARDS = [50, 60, 75, 90, 110, 140, 250];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function rewardForStreak(streak: number): number {
  return DAILY_REWARDS[(streak - 1) % DAILY_REWARDS.length];
}

interface AccountDailyRow {
  last_daily_claim_day: string | null;
  daily_streak: number;
}

export interface DailyStatus {
  streak: number;
  claimedToday: boolean;
  nextRewardCoins: number;
}

/** What the streak *would become* on a claim right now — used both to preview it and, in claimDaily, to actually apply it. */
function projectedStreak(row: AccountDailyRow | undefined): number {
  if (!row || row.last_daily_claim_day === null) return 1;
  if (row.last_daily_claim_day === todayUtc()) return row.daily_streak; // already claimed today — no change
  if (row.last_daily_claim_day === yesterdayUtc()) return row.daily_streak + 1;
  return 1; // missed a day (or more) — streak resets
}

export async function getDailyStatus(pool: Pool, accountId: string): Promise<DailyStatus> {
  const result = await pool.query<AccountDailyRow>(
    "select last_daily_claim_day, daily_streak from accounts where id = $1",
    [accountId],
  );
  const row = result.rows[0];
  const claimedToday = row?.last_daily_claim_day === todayUtc();
  const streak = claimedToday ? row.daily_streak : projectedStreak(row);
  return { streak: row?.daily_streak ?? 0, claimedToday, nextRewardCoins: rewardForStreak(streak) };
}

export interface DailyClaimResult {
  coinsEarned: number;
  streak: number;
  balance: number;
}

/**
 * Locks the account row, checks it hasn't already claimed today (UTC), then
 * either extends yesterday's streak by one or resets to 1 if a day was
 * missed, credits that streak day's Coins, and records today as the claim
 * day — all in one transaction, same lock-then-check-then-write shape as
 * packsRepo.ts's openPack.
 */
export async function claimDaily(pool: Pool, accountId: string): Promise<DailyClaimResult> {
  return withTransaction(pool, async (client) => {
    const result = await client.query<AccountDailyRow>(
      "select last_daily_claim_day, daily_streak from accounts where id = $1 for update",
      [accountId],
    );
    const row = result.rows[0];
    const today = todayUtc();
    if (row?.last_daily_claim_day === today) {
      throw new AlreadyClaimedTodayError("Already claimed today's daily reward.");
    }

    const streak = projectedStreak(row);
    const reward = rewardForStreak(streak);
    const balance = await applyCoinDeltaOnClient(client, accountId, reward, "daily_login");
    await client.query("update accounts set last_daily_claim_day = $1, daily_streak = $2 where id = $3", [today, streak, accountId]);

    return { coinsEarned: reward, streak, balance };
  });
}
