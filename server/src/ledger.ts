import type { PoolClient } from "pg";

/**
 * Generic "cached balance column + append-only audit table" ledger delta,
 * shared by Coins (coinsRepo.ts) and Dust (craftingRepo.ts) — same shape in
 * both places, so this factors out the one real difference: which column and
 * which audit table. Deliberately a closed union of real column/table pairs,
 * not a free-form (string, string) config — this can never be pointed at a
 * caller-supplied identifier, only the two literal ledgers that exist.
 */
function makeLedger(balanceColumn: "coins_balance" | "dust_balance", transactionsTable: "coin_transactions" | "dust_transactions") {
  return async function applyDeltaOnClient(client: PoolClient, accountId: string, amount: number, reason: string): Promise<number> {
    const result = await client.query<Record<string, number>>(
      `update accounts set ${balanceColumn} = ${balanceColumn} + $1 where id = $2 returning ${balanceColumn}`,
      [amount, accountId],
    );
    await client.query(`insert into ${transactionsTable} (account_id, amount, reason) values ($1, $2, $3)`, [accountId, amount, reason]);
    return result.rows[0][balanceColumn];
  };
}

export const applyCoinDeltaOnClient = makeLedger("coins_balance", "coin_transactions");
export const applyDustDeltaOnClient = makeLedger("dust_balance", "dust_transactions");
