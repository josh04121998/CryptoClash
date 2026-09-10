import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Lazily-created singleton pool against DATABASE_URL. Lazy so the module can
 * be imported (e.g. by tests that stub it out) without requiring the env var
 * to be set at import time — only actually connecting once a query runs.
 *
 * TLS note: `rejectUnauthorized: false` (the default below) encrypts the connection but never
 * verifies the server's certificate, so it doesn't actually protect against a MITM on the DB
 * connection. **Confirmed directly against production (session 19, 2026-09-10): setting
 * `DATABASE_SSL_VERIFY=true` breaks every DB-backed endpoint** — Railway's managed Postgres
 * presents a self-signed certificate, so Node's default trusted-CA store rejects it
 * (`self-signed certificate in certificate chain`), causing every query to fail. Live-tested by
 * flipping it on production, watching `/api/leaderboard/wins` start 500ing, and reverting within
 * minutes. Do not re-enable `DATABASE_SSL_VERIFY` without first supplying Railway's actual CA
 * certificate via `NODE_EXTRA_CA_CERTS` (or `ssl.ca` directly) — the flag alone does not work.
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
