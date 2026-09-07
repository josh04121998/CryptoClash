import type { Pool } from "pg";

export interface Account {
  id: string;
  walletAddress: string;
  /** True only on the sign-in that created this row — the welcome-bonus grant's idempotency guard. */
  isNew: boolean;
}

/**
 * Wallet address is the whole identity for this stage — get-or-create is the
 * only entry point. Single upsert (rather than select-then-insert) so two
 * concurrent first-time sign-ins for the same address can't race into a
 * unique-constraint error. `xmax = 0` is Postgres's standard tell for "this
 * row was just inserted, not updated" on an upsert.
 */
export async function findOrCreateAccount(pool: Pool, walletAddress: string): Promise<Account> {
  const lower = walletAddress.toLowerCase();
  const result = await pool.query<{ id: string; wallet_address: string; inserted: boolean }>(
    `insert into accounts (wallet_address) values ($1)
     on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
     returning id, wallet_address, (xmax = 0) as inserted`,
    [lower],
  );
  const row = result.rows[0];
  return { id: row.id, walletAddress: row.wallet_address, isNew: row.inserted };
}
