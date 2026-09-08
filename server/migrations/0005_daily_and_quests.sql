-- Coins earn loop, part 2 (spec.md Section 21's "quests" / "daily rewards", STATUS.md roadmap
-- step 10) — the welcome bonus and match results (0003) are one-time/occasional; this gives a
-- player a reason to come back and play *today* specifically.
--
-- Day boundaries are stored as plain UTC "YYYY-MM-DD" text, not a `date` column — `pg` parses
-- `date` into a JS Date object by default, which reintroduces the exact local/UTC ambiguity
-- this is trying to avoid. Both dailyRepo.ts and questsRepo.ts compute "today" as
-- `new Date().toISOString().slice(0, 10)` (always UTC) and compare it as a plain string.

alter table accounts add column if not exists last_daily_claim_day text;
alter table accounts add column if not exists daily_streak integer not null default 0;

-- One row per (account, quest, day) — quest *definitions* (goal, reward, which track a match
-- outcome feeds) live in code (questsRepo.ts's QUEST_DEFS), same reasoning card_templates
-- doesn't exist in Postgres (0002's deviation note): nothing here needs to be editable without
-- a deploy, so there's no reason to duplicate it into a config table.
create table if not exists quest_progress (
  account_id uuid not null references accounts(id) on delete cascade,
  quest_id text not null,
  day text not null,
  progress integer not null default 0,
  claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (account_id, quest_id, day)
);

create index if not exists quest_progress_account_id_idx on quest_progress(account_id);
