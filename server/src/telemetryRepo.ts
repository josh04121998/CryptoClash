import {
  isTelemetryEventName,
  TELEMETRY_MAX_PROP_KEYS,
  TELEMETRY_MAX_PROP_STRING_LENGTH,
  type TelemetryEvent,
  type TelemetryProps,
} from "@cryptoclash/protocol";
import type { Pool } from "pg";

/**
 * Product telemetry ingest (session 33) — the write half of `analytics_events`
 * (0013_analytics_events.sql). Read-side queries (funnels, retention, economy tuning) are
 * deliberately not here: nothing in the product surfaces them yet, they're ad-hoc SQL against a
 * table whose whole point is that any question can be asked of it later, and inventing an API
 * for numbers nobody has looked at once would be guessing.
 *
 * Two hard rules from the telemetry contract shape everything below:
 *
 * 1. **Never trust the client.** Event names are checked against the server-side allowlist
 *    (TELEMETRY_EVENT_NAMES) and anything else is dropped *silently* — the caller gets a 202
 *    either way, so a probe can't enumerate the allowlist by watching status codes. Props are
 *    re-validated field by field rather than stored as-received.
 * 2. **Telemetry must never break the game.** Nothing here throws on a bad *event* — a
 *    malformed one is dropped and the rest of the batch still lands. A real database failure
 *    does throw, and the one caller (POST /api/telemetry) swallows it into a 202; losing
 *    analytics is always preferable to failing a request a player is waiting on.
 */

export interface TelemetryBatchInput {
  anonId: string;
  /** Resolved server-side from the bearer token, never sent by the client. Null for anonymous traffic — which is most of the funnel. */
  accountId: string | null;
  events: TelemetryEvent[];
}

/**
 * Validates one client-supplied event, returning a normalized copy or null if it should be
 * dropped. Null is never an error the client hears about — see the class comment.
 *
 * `ts` bounds: a client clock can be wrong by years (or be `undefined`, or `NaN`, which would
 * poison the insert), so anything outside a sane window is dropped rather than stored or
 * silently rewritten to server time — a nonsense timestamp quietly replaced by a plausible one
 * is worse than a missing row, because it looks real in a chart. `created_at` is the column any
 * time-window query should be using anyway.
 */
const MIN_CLIENT_TS = Date.UTC(2020, 0, 1);
const MAX_CLIENT_TS = Date.UTC(2100, 0, 1);

export function validateTelemetryEvent(raw: unknown): TelemetryEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as { name?: unknown; ts?: unknown; props?: unknown };

  if (!isTelemetryEventName(candidate.name)) return null;

  const ts = candidate.ts;
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts < MIN_CLIENT_TS || ts > MAX_CLIENT_TS) return null;

  if (candidate.props === undefined || candidate.props === null) return { name: candidate.name, ts: Math.floor(ts) };
  const props = validateProps(candidate.props);
  if (!props) return null;
  return { name: candidate.name, ts: Math.floor(ts), props };
}

/** Flat object, <= 10 keys, string/number/boolean values only, strings <= 64 chars. Anything else drops the whole event. */
function validateProps(raw: unknown): TelemetryProps | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > TELEMETRY_MAX_PROP_KEYS) return null;
  const out: TelemetryProps = {};
  for (const [key, value] of entries) {
    // Keys are held to the same length cap as string values. Every real prop key in the
    // allowlist is one short word (`mode`, `result`, `turns`, `packType`); a longer one is a
    // client bug or an attempt to smuggle payload through the key side of the map.
    if (key.length === 0 || key.length > TELEMETRY_MAX_PROP_STRING_LENGTH) return null;
    if (typeof value === "string") {
      if (value.length > TELEMETRY_MAX_PROP_STRING_LENGTH) return null;
      out[key] = value;
    } else if (typeof value === "number") {
      // JSON.parse can produce Infinity only via a literal the parser rejects, but a number
      // that can't round-trip through jsonb is still worth refusing explicitly.
      if (!Number.isFinite(value)) return null;
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else {
      // null, nested objects, arrays — all dropped. (A JSON `NaN`/`Infinity` arrives as null.)
      return null;
    }
  }
  return out;
}

/**
 * Inserts an already-validated batch and returns the number of rows written.
 *
 * One multi-row `insert ... values (...), (...)` rather than a loop of single inserts: a batch
 * is up to 50 events and this is the highest-volume write path in the server, so a round trip
 * per event would dominate. Deliberately *not* wrapped in txHelper.ts's `withTransaction` —
 * a single statement is already atomic in Postgres, so the wrapper would only add a
 * connect/begin/commit round trip per batch and buy nothing. (The repos that use it, e.g.
 * packsRepo/craftingRepo, need it because they issue several dependent statements that must
 * stand or fall together; this doesn't.)
 */
export async function insertTelemetryEvents(pool: Pool, input: TelemetryBatchInput): Promise<number> {
  if (input.events.length === 0) return 0;

  const values: unknown[] = [];
  const rows = input.events.map((event, i) => {
    const base = i * 5;
    values.push(
      event.name,
      input.anonId,
      input.accountId,
      JSON.stringify(event.props ?? {}),
      new Date(event.ts),
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5})`;
  });

  const result = await pool.query(
    `insert into analytics_events (name, anon_id, account_id, props, client_ts) values ${rows.join(", ")}`,
    values,
  );
  return result.rowCount ?? 0;
}
