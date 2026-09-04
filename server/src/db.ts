import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Lazily-created singleton pool against DATABASE_URL. Lazy so the module can
 * be imported (e.g. by tests that stub it out) without requiring the env var
 * to be set at import time — only actually connecting once a query runs.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
