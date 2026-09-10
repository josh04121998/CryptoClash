import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Lazily-created singleton pool against DATABASE_URL. Lazy so the module can
 * be imported (e.g. by tests that stub it out) without requiring the env var
 * to be set at import time — only actually connecting once a query runs.
 *
 * TLS note: `rejectUnauthorized: false` (the default below) encrypts the connection but never
 * verifies the server's certificate, so it doesn't actually protect against a MITM on the DB
 * connection — it's kept as the default here only because this pool connects to the real,
 * currently-working production Railway Postgres, and flipping cert verification on blind risks
 * breaking that connection outright (e.g. if Railway's managed Postgres doesn't present a
 * publicly-trusted CA cert, or needs a specific CA bundle supplied). Set `DATABASE_SSL_VERIFY=true`
 * to opt into real verification (`rejectUnauthorized: true`) once you've confirmed — against the
 * real production connection string, e.g. via `railway connect Postgres --tunnel-only` — that the
 * cert Railway presents is verifiable as-is, or supply the right CA via `NODE_EXTRA_CA_CERTS`
 * first. Do not flip this default without that confirmation.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    const ssl =
      process.env.DATABASE_SSL === "false"
        ? undefined
        : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY === "true" };
    pool = new Pool({ connectionString, ssl });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
