import type { Pool, PoolClient } from "pg";

/**
 * Placeholder economy number — enough for 3 standard packs (see packsRepo.ts)
 * so a new account has something to do immediately. Not a tuned onboarding
 * figure; there's no real earn loop yet (spec.md Section 21's "playing,
 * winning, quests, dailies" — none of that is wired to accounts today), so
 * this is the only Coins source until one exists.
 */
export const WELCOME_BONUS_COINS = 3000;

export async function getBalance(pool: Pool, accountId: string): Promise<number> {
  const result = await pool.query<{ coins_balance: number }>("select coins_balance from accounts where id = $1", [accountId]);
  return result.rows[0]?.coins_balance ?? 0;
}

/**
 * Records an earn (positive amount) or spend (negative amount) against the
 * cached `accounts.coins_balance`, plus an audit row in `coin_transactions`.
 * Runs in its own transaction — callers needing this alongside other writes
 * in one atomic unit (packsRepo's debit-then-grant-cards) do the equivalent
 * inline against their own `PoolClient` instead of calling this.
 */
async function applyCoinDelta(pool: Pool, accountId: string, amount: number, reason: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const balance = await applyCoinDeltaOnClient(client, accountId, amount, reason);
    await client.query("commit");
    return balance;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Same delta logic as applyCoinDelta, but against a caller-owned transaction. */
export async function applyCoinDeltaOnClient(client: PoolClient, accountId: string, amount: number, reason: string): Promise<number> {
  const result = await client.query<{ coins_balance: number }>(
    "update accounts set coins_balance = coins_balance + $1 where id = $2 returning coins_balance",
    [amount, accountId],
  );
  await client.query("insert into coin_transactions (account_id, amount, reason) values ($1, $2, $3)", [accountId, amount, reason]);
  return result.rows[0].coins_balance;
}

export async function creditCoins(pool: Pool, accountId: string, amount: number, reason: string): Promise<number> {
  if (amount <= 0) throw new Error("creditCoins amount must be positive.");
  return applyCoinDelta(pool, accountId, amount, reason);
}

/** Called once, right after account creation — the caller's isNew check (accounts.ts) is the idempotency guard, not a ledger lookup here. */
export async function grantWelcomeBonus(pool: Pool, accountId: string): Promise<void> {
  await creditCoins(pool, accountId, WELCOME_BONUS_COINS, "welcome_bonus");
}

export type MatchOutcome = "win" | "loss" | "draw";

/**
 * Placeholder match-reward economy — spec.md Section 21 lists "playing,
 * winning" as a Coins source but gives no numbers (same "not tuned economy
 * design" caveat as WELCOME_BONUS_COINS above). A win pays more than a loss
 * so the incentive is real, but a loss still pays something so a full match
 * played to completion has *some* value beyond just winning. A Draw sits
 * between the two — the player neither won nor lost, so neither rate fits;
 * this is a first-pass number, not a modeled "how rare are draws" decision.
 *
 * Only Play Online awards this (see matchRoom.ts) — Play vs AI runs entirely
 * client-side with no server validation of the outcome, so it's deliberately
 * excluded rather than trusting a client-reported win.
 */
export const MATCH_WIN_COINS = 100;
export const MATCH_LOSS_COINS = 25;
export const MATCH_DRAW_COINS = 50;

function matchRewardAmount(outcome: MatchOutcome): number {
  switch (outcome) {
    case "win":
      return MATCH_WIN_COINS;
    case "loss":
      return MATCH_LOSS_COINS;
    case "draw":
      return MATCH_DRAW_COINS;
  }
}

/** Called once per Play Online match, per participant with a real (wallet-linked) session — see matchRoom.ts. */
export async function awardMatchResult(
  pool: Pool,
  accountId: string,
  outcome: MatchOutcome,
): Promise<{ amount: number; balance: number }> {
  const amount = matchRewardAmount(outcome);
  const balance = await creditCoins(pool, accountId, amount, `match_${outcome}`);
  return { amount, balance };
}
