import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { PackCard } from "./collectionRepo.js";
import { rollGrantAndLog } from "./packsRepo.js";
import { withTransaction } from "./txHelper.js";

/**
 * Referral / invite system (viral growth lever — added directly at the
 * user's request: "some sort of social invite feature eg free packs or free
 * card to get the viral spread going"). Both sides get a free Standard Pack:
 * the referred player's is granted immediately at their first sign-in (they
 * already took the one real action — connect + sign — that matters here);
 * the referrer's is granted only once the referred account completes its
 * first Play Online match (matchRoom.ts's post-match hook), the same
 * server-validated-event bar Coins/quests already use, so simply creating a
 * wallet doesn't pay out on its own.
 *
 * Known gap, not solved here: two wallets under one attacker's control can
 * still farm one free pack each by referring one another and playing a
 * single match together — bounded by the same "needs a live opponent"
 * friction that already caps Play Online Coins farming (coinsRepo.ts), not a
 * new hole this feature opens. Revisit if it's ever actually exploited at
 * scale; not worth a rate limiter for a feature with zero real users yet.
 */

function randomCode(): string {
  return randomBytes(6).toString("hex").slice(0, 8);
}

/** Lazily generated on first request (not at account-creation time) — most accounts will never share theirs, so there's no reason to burn a code for every sign-in. */
export async function getOrCreateReferralCode(pool: Pool, accountId: string): Promise<string> {
  const existing = await pool.query<{ referral_code: string | null }>("select referral_code from accounts where id = $1", [accountId]);
  const current = existing.rows[0]?.referral_code;
  if (current) return current;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await pool.query("update accounts set referral_code = $1 where id = $2", [code, accountId]);
      return code;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") continue; // unique_violation on referral_code — collision, retry with a new one
      throw e;
    }
  }
  throw new Error("Could not generate a unique referral code after 5 attempts.");
}

export interface ReferralStats {
  code: string;
  totalReferred: number;
  rewarded: number;
  pending: number;
}

export async function getReferralStats(pool: Pool, accountId: string): Promise<ReferralStats> {
  const code = await getOrCreateReferralCode(pool, accountId);
  const counts = await pool.query<{ status: string; count: string }>(
    "select status, count(*)::int as count from referrals where referrer_id = $1 group by status",
    [accountId],
  );
  let rewarded = 0;
  let pending = 0;
  for (const row of counts.rows) {
    if (row.status === "rewarded") rewarded = Number(row.count);
    else if (row.status === "pending") pending = Number(row.count);
  }
  return { code, totalReferred: rewarded + pending, rewarded, pending };
}

export interface ReferralSignupResult {
  referrerId: string;
  cards: PackCard[];
}

/**
 * Called once, right after a brand-new account's first sign-in (httpApi.ts's
 * /api/auth/verify, gated on Account.isNew — same idempotency guard
 * grantWelcomeBonus uses). Records the referral relationship and immediately
 * grants the *referred* account's free pack. Returns null (a quiet no-op,
 * not an error) for an unknown code or a self-referral — a stale/garbled
 * `?ref=` param shouldn't block sign-in.
 */
export async function recordReferralSignup(pool: Pool, referredAccountId: string, referralCode: string): Promise<ReferralSignupResult | null> {
  const referrer = await pool.query<{ id: string }>("select id from accounts where referral_code = $1", [referralCode]);
  const referrerId = referrer.rows[0]?.id;
  if (!referrerId || referrerId === referredAccountId) return null;

  return withTransaction(pool, async (client) => {
    // referred_id is unique — this can only ever succeed once per account, first-sign-in-only
    // by construction (isNew), but `on conflict do nothing` is the real backstop.
    const inserted = await client.query(
      `insert into referrals (referrer_id, referred_id, status) values ($1, $2, 'pending')
       on conflict (referred_id) do nothing
       returning id`,
      [referrerId, referredAccountId],
    );
    // Nothing was written (`on conflict do nothing` — 0 rows), so committing this empty
    // transaction is equivalent to rolling it back; no need to special-case it.
    if (inserted.rows.length === 0) return null;

    const cards = await rollGrantAndLog(client, referredAccountId, "standard", 0);
    return { referrerId, cards };
  });
}

export interface ReferrerRewardResult {
  referrerId: string;
  cards: PackCard[];
}

/**
 * Called after every completed Play Online match (matchRoom.ts), for
 * whichever participant(s) have a real accountId — best-effort, same as the
 * Coins/quest hooks it sits alongside. The `update ... where status =
 * 'pending' returning` is the whole compare-and-set: fires exactly once,
 * the very first time this account's match completes after being referred,
 * and is a silent no-op (null) for every other account and every later match.
 */
export async function rewardReferrerIfPending(pool: Pool, referredAccountId: string): Promise<ReferrerRewardResult | null> {
  return withTransaction(pool, async (client) => {
    const flipped = await client.query<{ referrer_id: string }>(
      `update referrals set status = 'rewarded', rewarded_at = now()
       where referred_id = $1 and status = 'pending'
       returning referrer_id`,
      [referredAccountId],
    );
    // Nothing matched the `where`, so this update was a no-op — the outer commit below covers
    // this branch too, same reasoning as recordReferralSignup's on-conflict-do-nothing above.
    if (flipped.rows.length === 0) return null;

    const referrerId = flipped.rows[0].referrer_id;
    const cards = await rollGrantAndLog(client, referrerId, "standard", 0);
    return { referrerId, cards };
  });
}
