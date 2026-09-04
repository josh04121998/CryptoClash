import type { Pool } from "pg";

export interface Account {
  id: string;
  walletAddress: string;
}

/**
 * Wallet address is the whole identity for this stage — get-or-create is the
 * only entry point. Single upsert (rather than select-then-insert) so two
 * concurrent first-time sign-ins for the same address can't race into a
 * unique-constraint error.
 */
export async function findOrCreateAccount(pool: Pool, walletAddress: string): Promise<Account> {
  const lower = walletAddress.toLowerCase();
  const result = await pool.query<{ id: string; wallet_address: string }>(
    `insert into accounts (wallet_address) values ($1)
     on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
     returning id, wallet_address`,
    [lower],
  );
  return { id: result.rows[0].id, walletAddress: result.rows[0].wallet_address };
}
