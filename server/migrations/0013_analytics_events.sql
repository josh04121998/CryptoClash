-- Product telemetry (session 33). The only instrumentation before this was Vercel Analytics
-- pageviews, which can't answer the launch-readiness questions: how many people who land
-- connect a wallet, save a deck, finish a match; do they come back the next day; are the pack
-- odds / Dust / daily / quest / rank numbers anywhere near right. Every economy constant in this
-- codebase is a first design pass with nothing to tune against (same caveat 0007 carries), and
-- first-player data only happens once — so this table exists to catch it.
--
-- Append-only and deliberately dumb: one row per client-reported event, no aggregates, no
-- rollups, no cached counters. Same "can't drift from the ledger it's reading" posture as
-- coin_transactions (0003) and rank_points_transactions (0007) — every funnel number is a
-- query over this table, never a stored column.
--
-- **No PII, by construction.** There is no column here for an IP address, wallet address, user
-- agent or referrer, and there never should be. Identity is exactly two things: `account_id`
-- (the internal uuid, resolved server-side from the session token — the client never sends
-- one) and `anon_id`, a random client-generated id that buckets a *browser*, not a person, and
-- is what makes the pre-wallet half of the funnel joinable to the post-wallet half.
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  -- Validated against a server-side allowlist before it ever gets here (shared/src/index.ts's
  -- TELEMETRY_EVENT_NAMES); anything else is dropped at the API boundary. Kept as text rather
  -- than an enum type for the same reason quest/achievement ids are text: the set of names
  -- changes with product work, and an enum would need a migration per addition.
  name text not null,
  anon_id text not null,
  -- Nullable: the pre-wallet part of the funnel (landing, tutorial, AI matches) is entirely
  -- anonymous, and that's exactly the part we can't currently see. `on delete set null`, NOT
  -- the `cascade` the gameplay tables use — deleting an account should drop the link to a
  -- person, not silently rewrite history by erasing the matches/packs/sign-ups they
  -- contributed to the funnel counts.
  account_id uuid references accounts(id) on delete set null,
  -- Flat bag of primitives, capped at the API boundary (<= 10 keys, string/number/boolean
  -- values, strings <= 64 chars). jsonb rather than columns-per-event because the props differ
  -- per event name (`{mode}` vs `{mode, result, turns}` vs `{packType}`), and a wide sparse
  -- table would need a migration every time an event gains a dimension. No free text from user
  -- input ever goes in here — values are from fixed sets the client already has.
  props jsonb not null default '{}'::jsonb,
  -- The client's own clock at fire time, and the server's at receipt. Both, deliberately:
  -- client_ts is the only thing that orders events *within* one device's session (a batch
  -- arrives all at once, so created_at collapses them), and created_at is the only one that
  -- can be trusted for cohort/retention windows, since a client clock can be wrong by years.
  client_ts timestamptz not null,
  created_at timestamptz not null default now()
);

-- A funnel query is "for each step, how many distinct devices did it in this window":
--   select name, count(distinct anon_id) from analytics_events
--    where name = any($1) and created_at >= $2 group by name
-- — equality on name, range on created_at, so (name, created_at) in that order lets Postgres
-- seek to each name's slice and stop at the window edge. The reverse order would scan the whole
-- window for every step. This is the index the read path actually leans on.
create index if not exists analytics_events_name_created_at_idx on analytics_events(name, created_at);

-- Per-device timeline: "what did this browser do, in order" (funnel *ordering*, drop-off
-- points, and next-day retention — did this anon_id come back). Same equality-then-range shape.
create index if not exists analytics_events_anon_id_created_at_idx on analytics_events(anon_id, created_at);

-- Per-account timeline, for the post-wallet half (does a player who opened a pack come back,
-- does rank progression correlate with retention). Partial, because the overwhelming majority
-- of rows are anonymous and a null-heavy full index would be mostly dead weight — every query
-- that uses this is asking about a specific real account, so it's always `account_id = $1`,
-- which implies `account_id is not null` and can therefore use the partial index.
create index if not exists analytics_events_account_id_created_at_idx
  on analytics_events(account_id, created_at)
  where account_id is not null;
