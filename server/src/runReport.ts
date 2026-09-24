import { Pool } from "pg";

/**
 * `npm run report --workspace=server` — the headline numbers from
 * server/sql/funnel.sql and server/sql/match_balance.sql, in one command.
 *
 * This exists because tuning has a practical enemy: if answering "how is it
 * going" means finding the right file, picking the right block, and pasting it
 * into psql, it gets done once and then never again. Every economy constant in
 * this codebase is a first design pass, and they stay that way until looking is
 * cheap.
 *
 * Deliberately read-only — no writes, no schema changes, safe to point at
 * production through the tunnel (see STATUS.md for the `railway connect
 * Postgres --tunnel-only` pattern). The SQL files remain the source of truth
 * and carry the caveats; this prints a subset of them.
 *
 * Read server/sql/funnel.sql's header before quoting any of this. The short
 * version: the unit is a browser, not a person; the client is untrusted; failed
 * events are dropped rather than retried, so every count is a floor.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** Matches runMigrate.ts: a plain pool, so the local tunnel works without extra flags. */
const pool = new Pool({ connectionString: databaseUrl });

const DAYS = Number(process.env.REPORT_DAYS) || 30;

function heading(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/**
 * Dates arrive from pg as JS Date objects, which stringify to
 * "Mon Sep 21 2026 00:00:00 GMT+0100 (British Summer Time)" — unreadable in a
 * column and different on every machine's timezone. Render dates as the day and
 * timestamps to the minute, both in UTC so two people reading the same report
 * see the same thing.
 */
function cell(value: unknown): string {
  // Timestamps only — plain dates are cast to text in SQL, because a pg `date`
  // arrives as a JS Date at *local* midnight and renders as the previous day in
  // any timezone west of UTC.
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace("T", " ") + "Z";
  return String(value ?? "");
}

function table(rows: Record<string, unknown>[], empty: string) {
  if (rows.length === 0) {
    console.log(`  \x1b[2m${empty}\x1b[0m`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const width = Object.fromEntries(
    cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => cell(r[c]).length))]),
  );
  console.log("  " + cols.map((c) => c.padEnd(width[c])).join("  "));
  console.log("  " + cols.map((c) => "-".repeat(width[c])).join("  "));
  for (const r of rows) {
    console.log("  " + cols.map((c) => cell(r[c]).padEnd(width[c])).join("  "));
  }
}

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

try {
  const [{ events, devices, since }] = await q(
    `select count(*)::int events, count(distinct anon_id)::int devices, min(created_at) since
       from analytics_events where created_at >= now() - ($1 || ' days')::interval`,
    [DAYS],
  );

  console.log(`\nFLOORWARS — last ${DAYS} days`);
  console.log(`${events} events from ${devices} devices${since ? `, since ${new Date(since).toISOString().slice(0, 10)}` : ""}`);

  if (events === 0) {
    console.log(
      "\n\x1b[2mNo telemetry yet. This is expected until real players arrive — the instrumentation\n" +
        "shipped before the traffic on purpose, so the first-player data is actually captured.\x1b[0m\n",
    );
  }

  heading("Funnel (devices reaching each step)");
  table(
    await q(
      `with steps(step, name) as (
         values (1,'app_open'),(2,'landing_cta'),(3,'match_started'),(4,'match_ended'),
                (5,'wallet_connect_started'),(6,'wallet_connected'),(7,'deck_saved')
       )
       select s.name as step,
              count(distinct e.anon_id)::int as devices,
              round(100.0 * count(distinct e.anon_id)
                / nullif(max(count(distinct e.anon_id)) over (), 0), 1) as pct_of_arrivals
         from steps s
         left join analytics_events e on e.name = s.name
          and e.created_at >= now() - ($1 || ' days')::interval
        group by s.step, s.name order by s.step`,
      [DAYS],
    ),
    "nothing yet",
  );

  heading("Next-day return, by arrival day");
  table(
    await q(
      `with first_seen as (select anon_id, min(created_at)::date d from analytics_events group by anon_id),
            returned as (
              select f.anon_id, f.d,
                     max(case when e.created_at::date > f.d then 1 else 0 end) back
                from first_seen f join analytics_events e on e.anon_id = f.anon_id
               group by f.anon_id, f.d)
       select d::text as cohort, count(*)::int devices, sum(back)::int returned,
              round(100.0 * sum(back) / nullif(count(*),0), 1) as pct
         from returned where d < current_date group by d order by d desc limit 14`,
    ),
    "no cohort has had a chance to return yet",
  );

  heading("Queue health (is Play Online viable, and is the 20s fallback right?)");
  table(
    await q(
      `select count(*) filter (where name='queue_waited')::int as queue_waits,
              count(*) filter (where name='bot_fallback_shown')::int as fell_back,
              round(100.0 * count(*) filter (where name='bot_fallback_shown')
                / nullif(count(*) filter (where name='queue_waited'),0), 1) as pct_fell_back,
              round(avg((props->>'seconds')::numeric) filter
                (where name='queue_waited' and props->>'seconds' ~ '^[0-9]+$'), 1) as avg_wait_s
         from analytics_events where created_at >= now() - ($1 || ' days')::interval`,
      [DAYS],
    ),
    "nobody has queued yet",
  );

  heading("Modes played, and whether they get finished");
  table(
    await q(
      `select started.mode,
              started.n::int as started,
              coalesce(ended.n,0)::int as ended,
              coalesce(ended.abandoned,0)::int as abandoned
         from (select props->>'mode' mode, count(*) n from analytics_events
                where name='match_started' and created_at >= now() - ($1 || ' days')::interval group by 1) started
         left join (select props->>'mode' mode, count(*) n,
                           count(*) filter (where props->>'result'='abandoned') abandoned
                      from analytics_events
                     where name='match_ended' and created_at >= now() - ($1 || ' days')::interval group by 1) ended
           on ended.mode = started.mode
        order by started.n desc`,
      [DAYS],
    ),
    "no matches started yet",
  );

  heading("Economy sinks (tune nothing until these are actually used)");
  table(
    await q(
      `select name, count(*)::int events, count(distinct anon_id)::int devices
         from analytics_events
        where name in ('pack_opened','craft_action','daily_claimed','deck_saved')
          and created_at >= now() - ($1 || ' days')::interval
        group by name order by events desc`,
      [DAYS],
    ),
    "no pack opens, crafts, daily claims or deck saves yet",
  );

  heading("Server-validated matches (the trustworthy half — online play only)");
  table(
    await q(
      `select end_reason,
              count(*)::int matches,
              round(avg(turns),1) as avg_turns,
              round(avg(duration_ms)/1000.0,1) as avg_seconds
         from matches where ended_at >= now() - ($1 || ' days')::interval
        group by end_reason order by matches desc`,
      [DAYS],
    ),
    "no online matches recorded yet",
  );

  heading("Crashes (the only place a production error surfaces)");
  table(
    await q(
      `select props->>'where' as boundary, props->>'name' as error,
              left(props->>'message', 40) as message,
              count(*)::int crashes, max(created_at) last_seen
         from analytics_events
        where name='client_error' and created_at >= now() - ($1 || ' days')::interval
        group by 1,2,3 order by crashes desc limit 10`,
      [DAYS],
    ),
    "none — good",
  );

  console.log("\n\x1b[2mCaveats that change how these read: server/sql/funnel.sql and match_balance.sql.\x1b[0m\n");
} catch (e) {
  console.error("Report failed:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
