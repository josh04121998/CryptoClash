-- Funnel, retention and economy-engagement queries over `analytics_events`
-- (server/migrations/0013_analytics_events.sql).
--
-- Companion to match_balance.sql, same rules: this file is NOT a migration and must never be
-- moved into server/migrations/ — the migration runner executes every *.sql file in that
-- directory in name order. It is reference documentation. Nothing here writes.
--
-- `npm run report --workspace=server` runs the headline blocks and prints them; everything
-- else is here to be pasted into psql when a specific question comes up.
--
-- =============================================================================
-- READ THIS BEFORE QUOTING ANY NUMBER FROM THIS FILE
-- =============================================================================
--
-- 1. THE UNIT IS A BROWSER, NOT A PERSON. `anon_id` is random per browser profile. One person
--    on a phone and a laptop is two; two people sharing a browser are one; anyone clearing site
--    data becomes a new one. Treat every count below as "devices", and never present it as
--    users. `account_id` is the only real identity here, and it exists only after a wallet
--    connect — which is itself most of the way down the funnel.
--
-- 2. THESE EVENTS ARE SELF-REPORTED BY AN UNTRUSTED CLIENT. Anyone can POST whatever the
--    allowlist accepts. Fine for product decisions, useless as proof of anything, and not to be
--    joined to `matches` (server-validated) and presented as one number. When the two disagree
--    about online matches, `matches` is right.
--
-- 3. EVENTS ARE DROPPED, NOT QUEUED, ON FAILURE. telemetry.ts bounds its queue and never
--    retries, and a page that dies before a flush loses whatever had not been sent (the
--    sendBeacon path exists to make that rare, not impossible). So every count here is a floor,
--    and the undercount is biased toward *short, broken, or rage-quit sessions* — exactly the
--    ones you most want to see. Never read a low number as "this does not happen".
--
-- 4. USE created_at, NOT client_ts, FOR ANY TIME WINDOW OR COHORT. client_ts is the browser's
--    own clock and can be wrong by years; it is only good for ordering events *within* one
--    device's session. created_at is the server's.
--
-- 5. NOTHING IS DEDUPLICATED. If a bug double-fires an event, it is two rows here. A number
--    that suddenly doubles is a bug before it is a trend.
--
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. THE FUNNEL. The headline question: of the devices that arrive, how many
--    get to a match, and where do the rest fall out?
-- ---------------------------------------------------------------------------
-- Ordered by how far down the funnel each step is, not alphabetically, so the
-- drop-off is readable straight down the column.
with steps(step, name) as (
  values (1, 'app_open'),        -- landed
         (2, 'landing_cta'),     -- clicked into the game
         (3, 'match_started'),   -- actually played something
         (4, 'match_ended'),     -- finished it
         (5, 'wallet_connect_started'),
         (6, 'wallet_connected'),
         (7, 'deck_saved')       -- the first act that needs an account
)
select
  s.step,
  s.name,
  count(distinct e.anon_id) as devices,
  round(
    100.0 * count(distinct e.anon_id)
      / nullif(max(count(distinct e.anon_id)) over (), 0),
    1
  ) as pct_of_arrivals
from steps s
left join analytics_events e
  on e.name = s.name
 and e.created_at >= now() - interval '30 days'
group by s.step, s.name
order by s.step;


-- ---------------------------------------------------------------------------
-- 2. DOES ANYONE COME BACK? Next-day return by arrival cohort.
-- ---------------------------------------------------------------------------
-- The single most important number for whether this is a game or a demo. A
-- device counts as returning if it fired anything at all on a later day.
-- Cohorts younger than a day are excluded — they have not had the chance yet,
-- and leaving them in drags the number down for no reason.
with first_seen as (
  select anon_id, min(created_at)::date as cohort_day
  from analytics_events
  group by anon_id
),
returned as (
  select f.anon_id, f.cohort_day,
         max(case when e.created_at::date > f.cohort_day then 1 else 0 end) as came_back
  from first_seen f
  join analytics_events e on e.anon_id = f.anon_id
  group by f.anon_id, f.cohort_day
)
select
  cohort_day,
  count(*) as devices,
  sum(came_back) as returned_later,
  round(100.0 * sum(came_back) / nullif(count(*), 0), 1) as pct_returned
from returned
where cohort_day < current_date          -- see note above
group by cohort_day
order by cohort_day desc
limit 30;


-- ---------------------------------------------------------------------------
-- 3. IS THE BOT FALLBACK THRESHOLD RIGHT? (client/src/queueFallback.ts)
-- ---------------------------------------------------------------------------
-- BOT_FALLBACK_SECONDS is currently 20, picked by judgement with no data. This
-- is the query that replaces the judgement.
--
-- How to read it: if real human matches are routinely made at 25-30s, the
-- threshold is stealing them and should go up. If nothing is ever matched past
-- ~10s, it is too patient and should come down. `matched` here means the wait
-- ended without a fallback firing for that device in the same window.
select
  width_bucket((props->>'seconds')::numeric, 0, 60, 12) * 5 - 5 as wait_bucket_seconds,
  count(*) as waits
from analytics_events
where name = 'queue_waited'
  and created_at >= now() - interval '30 days'
  and (props->>'seconds') ~ '^[0-9]+$'
group by 1
order by 1;

-- How often the queue gives up, versus how often anyone queues at all. This is
-- the "is Play Online viable yet" number: while it sits near 100%, there is no
-- real multiplayer, only a bot with extra steps.
select
  count(*) filter (where name = 'queue_waited')       as queue_waits,
  count(*) filter (where name = 'bot_fallback_shown') as fell_back_to_bot,
  round(
    100.0 * count(*) filter (where name = 'bot_fallback_shown')
      / nullif(count(*) filter (where name = 'queue_waited'), 0),
    1
  ) as pct_fell_back
from analytics_events
where created_at >= now() - interval '30 days';


-- ---------------------------------------------------------------------------
-- 4. WHICH MODE DO PEOPLE ACTUALLY PLAY, AND DO THEY FINISH?
-- ---------------------------------------------------------------------------
-- `bot_fallback` is deliberately separate from `ai`: same board, very different
-- intent — one was chosen, the other was a consolation prize. If bot_fallback
-- matches are abandoned far more often than chosen ai ones, the fallback is
-- being tolerated rather than enjoyed, and that is worth knowing.
select
  started.mode,
  started.n                                         as started,
  coalesce(ended.n, 0)                              as ended,
  coalesce(ended.abandoned, 0)                      as abandoned,
  round(100.0 * coalesce(ended.abandoned, 0) / nullif(ended.n, 0), 1) as pct_abandoned
from (
  select props->>'mode' as mode, count(*) as n
  from analytics_events
  where name = 'match_started' and created_at >= now() - interval '30 days'
  group by 1
) started
left join (
  select props->>'mode' as mode,
         count(*) as n,
         count(*) filter (where props->>'result' = 'abandoned') as abandoned
  from analytics_events
  where name = 'match_ended' and created_at >= now() - interval '30 days'
  group by 1
) ended on ended.mode = started.mode
order by started.n desc;


-- ---------------------------------------------------------------------------
-- 5. DOES THE TUTORIAL EARN ITS PLACE?
-- ---------------------------------------------------------------------------
-- It is the first thing a new player is offered, so a bad completion rate is
-- expensive. Compare `tutorial_completed` against devices that went on to start
-- a match — if skippers convert as well as completers, the tutorial is costing
-- more than it returns.
select
  count(distinct anon_id) filter (where name = 'tutorial_offered')  as offered,
  count(distinct anon_id) filter (where name = 'tutorial_started')  as started,
  count(distinct anon_id) filter (where name = 'tutorial_completed') as completed,
  count(distinct anon_id) filter (where name = 'tutorial_skipped')  as skipped
from analytics_events
where created_at >= now() - interval '30 days';


-- ---------------------------------------------------------------------------
-- 6. IS THE COINS ECONOMY BEING TOUCHED AT ALL?
-- ---------------------------------------------------------------------------
-- Every economy constant (pack cost 1000, FOIL_CHANCE 0.08, the Dust rates, the
-- daily/weekly/quest amounts) is a first design pass. Before tuning any of
-- them, check the sinks are even being used: a pack-odds debate is moot if
-- nobody has opened a pack.
select
  name,
  count(*)                   as events,
  count(distinct anon_id)    as devices
from analytics_events
where name in ('pack_opened', 'craft_action', 'daily_claimed', 'deck_saved')
  and created_at >= now() - interval '30 days'
group by name
order by events desc;


-- ---------------------------------------------------------------------------
-- 7. IS ANYTHING ON FIRE? (client/src/ErrorBoundary.tsx)
-- ---------------------------------------------------------------------------
-- There is no error-tracking service here, so this is the only place a
-- production crash shows up at all. Any row is worth reading; a `where` that
-- suddenly appears after a deploy is a regression until proven otherwise.
select
  props->>'where'   as boundary,
  props->>'name'    as error_name,
  props->>'message' as message,
  count(*)                as crashes,
  count(distinct anon_id) as devices_affected,
  max(created_at)         as last_seen
from analytics_events
where name = 'client_error'
  and created_at >= now() - interval '30 days'
group by 1, 2, 3
order by crashes desc;
