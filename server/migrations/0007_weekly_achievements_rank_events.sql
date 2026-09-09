-- Coins-earn loop, part 3 (spec.md Section 21's remaining sources: weekly rewards,
-- achievements, ranked progression, and events — STATUS.md roadmap step 10's "still open"
-- list). Same "first design pass, not tuned" caveat as every other economy constant in this
-- codebase (match rewards, daily rewards, quest rewards, pack odds, Dust values).

-- Weekly rewards: same shape as 0005's daily-login pair (last_daily_claim_day/daily_streak),
-- but keyed by ISO 8601 week ("2026-W37", see weeklyRepo.ts's isoWeekOf) instead of a UTC day.
-- Stored as text for the same reason 0005's day columns are text, not a `date` column — `pg`
-- parses `date` into a JS Date object by default, reintroducing local/UTC ambiguity.
alter table accounts add column if not exists last_weekly_claim_week text;
alter table accounts add column if not exists weekly_streak integer not null default 0;

-- Achievements: one-time/permanent, unlike quest_progress's (account, quest, day) — no day
-- column, a row is created once and never resets. Definitions (goal, reward Coins, which real
-- server-validated event track feeds it) live in code (achievementsRepo.ts's ACHIEVEMENT_DEFS),
-- same "no config table for gameplay-adjacent identity" reasoning as QUEST_DEFS/CARD_POOL.
create table if not exists achievement_progress (
  account_id uuid not null references accounts(id) on delete cascade,
  achievement_id text not null,
  progress integer not null default 0,
  claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (account_id, achievement_id)
);

create index if not exists achievement_progress_account_id_idx on achievement_progress(account_id);

-- Backs the "win_streak" achievement track: the current *live* streak, reset to 0 on any
-- loss/draw and incremented on a win (matchRoom.ts, via achievementsRepo.ts's
-- recordMatchOutcomeForAchievements). achievement_progress separately records the *best* streak
-- ever reached (a running max, not this live counter) — a broken streak shouldn't erase the
-- record of the best one.
alter table accounts add column if not exists current_win_streak integer not null default 0;

-- Ranked progression: an append-only points ledger, deliberately separate from
-- coin_transactions even though it shares the same "append-only + derived" posture as
-- leaderboardRepo.ts's read-side aggregation over that table — rank points and Coins move
-- independently (a loss still earns some Coins but *costs* rank points), so there's no single
-- "amount" column that means the same thing for both. Current points is always
-- sum(amount) (floored at 0 for tier lookup, see rankRepo.ts), never a cached column, same
-- "can't drift from the ledger it's reading" reasoning as leaderboardRepo.ts.
--
-- This is the progression/*display* layer only — a rank tier derived from real match results,
-- NOT skill-based matchmaking (matches are still FIFO-queued; pairing players by rank/points is
-- a separate, larger roadmap item, already tracked in STATUS.md Section 5's "known
-- limitations" and deliberately not attempted here).
create table if not exists rank_points_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists rank_points_transactions_account_id_idx on rank_points_transactions(account_id);

-- Events: a minimal time-boxed Coins-multiplier bonus the server can toggle (spec.md Section
-- 21's "Events" earn source — the "Events" *spend* line from that same section is a documented,
-- unbuilt stub; see eventsRepo.ts's top comment for the full scope note on what this table does
-- and deliberately doesn't do). No admin auth system exists yet in this codebase, so there's no
-- UI to create a row here — see httpApi.ts's POST /api/admin/events (gated by a shared-secret
-- ADMIN_SECRET env var) for the one crude way to set one, or insert a row directly.
create table if not exists events (
  id text primary key,
  name text not null,
  description text not null,
  coin_multiplier numeric not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
