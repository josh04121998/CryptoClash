import type { Pool } from "pg";

/**
 * Events (spec.md Section 21's "Events" earn source, and its "Events" spend line) — deliberately
 * scoped down to the minimal real version the brief calls out: a time-boxed Coins-multiplier
 * bonus the server can toggle (e.g. a "double Coins weekend"), surfaced to the client as a
 * banner. This is NOT a live-ops content system — no event-exclusive cards, shop items, or
 * cosmetics exist, and spec.md Section 21's "Coins spent on... Events" stays a documented,
 * unbuilt stub. Extending this into real event *content* is a bigger, separate piece of work
 * that needs actual design (what does an event sell, how often do they run, what makes one
 * worth logging in for) — this only builds the data model and the one hook point (a Coins
 * multiplier) the brief asked for.
 *
 * The multiplier is applied *only* to Play Online match rewards (coinsRepo.ts's
 * awardMatchResult) — not to daily/weekly/quest/achievement claims. That's a scope reduction to
 * keep this pass bounded, not an oversight: extending it to those other credit sites is
 * mechanically identical (call getActiveEvent() at each one), but whether a "double Coins
 * weekend" is meant to double *everything* or just match rewards is a real product call, not
 * assumed here.
 *
 * No admin auth system exists anywhere in this codebase yet, so there is deliberately no admin
 * UI — see httpApi.ts's POST/DELETE /api/admin/events, gated by a shared-secret ADMIN_SECRET env
 * var (unset = the routes 501, not a security promise, just "not configured"). This is a crude,
 * good-enough-for-one-operator toggle, not a general admin panel. The first real event's actual
 * content (name, dates, multiplier) is left undecided here — a documented stub, not faked.
 */
export interface EventConfig {
  id: string;
  name: string;
  description: string;
  coinMultiplier: number;
  startsAt: string;
  endsAt: string;
}

interface EventRow {
  id: string;
  name: string;
  description: string;
  coin_multiplier: string;
  starts_at: Date;
  ends_at: Date;
}

function toConfig(row: EventRow): EventConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    coinMultiplier: Number(row.coin_multiplier),
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
  };
}

/**
 * The currently-active event, if any — `now()` between `starts_at`/`ends_at`. More than one
 * overlapping row is legal in the schema but nothing here resolves a priority between them;
 * picks whichever started most recently. Returns null (not a throw) when nothing's active,
 * which is the common case until a real event is ever configured.
 */
export async function getActiveEvent(pool: Pool): Promise<EventConfig | null> {
  const result = await pool.query<EventRow>(
    "select * from events where now() between starts_at and ends_at order by starts_at desc limit 1",
  );
  return result.rows[0] ? toConfig(result.rows[0]) : null;
}

export interface UpsertEventInput {
  id: string;
  name: string;
  description: string;
  coinMultiplier: number;
  startsAt: string;
  endsAt: string;
}

/** Admin-only (see the top comment) — creates or replaces an event by id. */
export async function upsertEvent(pool: Pool, input: UpsertEventInput): Promise<EventConfig> {
  const result = await pool.query<EventRow>(
    `insert into events (id, name, description, coin_multiplier, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set
       name = excluded.name,
       description = excluded.description,
       coin_multiplier = excluded.coin_multiplier,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at
     returning *`,
    [input.id, input.name, input.description, input.coinMultiplier, input.startsAt, input.endsAt],
  );
  return toConfig(result.rows[0]);
}

/** Admin-only (see the top comment). */
export async function deleteEvent(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query("delete from events where id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
