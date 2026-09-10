import type { Pool, PoolClient } from "pg";

/**
 * Shared connect/begin/commit/rollback/release scaffolding — the exact same pattern was
 * hand-rolled at every transactional call site across the repo* files (coinsRepo.ts,
 * achievementsRepo.ts, collectionRepo.ts, craftingRepo.ts, dailyRepo.ts, packsRepo.ts,
 * questsRepo.ts, referralsRepo.ts, weeklyRepo.ts — see STATUS.md Section 8 item 16's audit).
 * `fn` runs against a fresh `PoolClient` already inside `begin`; a normal return commits, a
 * thrown error rolls back and rethrows. The client is always released.
 *
 * Deliberately not added to db.ts — see the session's task notes on avoiding a merge conflict
 * with the parallel security-hardening work touching that file.
 */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
