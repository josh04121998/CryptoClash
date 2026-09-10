import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./ledger.js";
import { withTransaction } from "./txHelper.js";

export { applyCoinDeltaOnClient };

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
  return withTransaction(pool, (client) => applyCoinDeltaOnClient(client, accountId, amount, reason));
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
 * The `coin_transactions.reason` strings awardMatchResult writes below — exported so
 * leaderboardRepo.ts can query "how many wins/losses/draws has this account had" straight
 * off the existing audit log instead of a second, denormalized wins/losses column that could
 * drift out of sync with it. `MATCH_REASONS` is every reason a completed Play Online match
 * writes, i.e. "how many games has this account played" as a single IN-list.
 */
export const MATCH_REASON: Record<MatchOutcome, string> = { win: "match_win", loss: "match_loss", draw: "match_draw" };
export const MATCH_REASONS: string[] = Object.values(MATCH_REASON);

/**
 * Removed 2026-09-10 (session 20) — a flat per-match Coins payout, including
 * a flat payout for *losing*, is exactly what let a bot farm Coins by
 * queueing and immediately leaving (see spec.md Section 21's "Anti-farming
 * redesign" writeup for the full incident). Modeled on how Hearthstone's
 * real economy works: normal Play pays no per-match gold at all — gold comes
 * only from daily quests and streak bonuses, which are capped by
 * construction regardless of how many extra matches get played. This
 * codebase already had that exact capped machinery (questsRepo.ts's
 * play_1/play_3/win_1, dailyRepo.ts, weeklyRepo.ts) sitting *alongside* the
 * flat reward below, redundantly — this deletes the redundant, farmable half
 * rather than the capped one. A win's first-of-the-day value now comes
 * entirely from the win_1 quest.
 *
 * `awardMatchResult` still writes a zero-amount `coin_transactions` row per
 * match (reason `match_win`/`match_loss`/`match_draw`) — not a leftover, a
 * deliberate compromise: `leaderboardRepo.ts`'s Most Wins/Win Rate tabs are
 * built entirely as read-side aggregates over exactly these reason strings
 * (session 7), and breaking that wasn't in scope for this change. A
 * zero-amount row changes no balance but keeps the leaderboard's audit trail
 * intact. Correspondingly, no `matchReward` WS message is sent anymore
 * (there's nothing to notify the player of) — see matchRoom.ts. The
 * `matchReward` message type/client handling is now unreachable dead code,
 * left in place rather than torn out across shared/client/tests in this same
 * change; worth removing (or repurposing — e.g. for a future quest-claimed
 * banner) in a follow-up. Events' `coin_multiplier` (eventsRepo.ts) also
 * loses its only hook point here — it had no first event's content decided
 * anyway (session 17), so this is an extension of an already-flagged gap,
 * not a new regression; retarget it at a different Coins source if events
 * ever get built out.
 *
 * The turn-threshold/asymmetric-leave anti-abuse gate (same spec.md
 * subsection) is a deliberately separate, deferred follow-up — the user's
 * call: cutting the flat reward already shrinks the exploitable surface to
 * "at most one day's capped quest value," which was judged enough to ship
 * now without the more invasive `matchRoom.ts` engagement-gating change.
 */
export async function awardMatchResult(pool: Pool, accountId: string, outcome: MatchOutcome): Promise<void> {
  await applyCoinDelta(pool, accountId, 0, MATCH_REASON[outcome]);
}
