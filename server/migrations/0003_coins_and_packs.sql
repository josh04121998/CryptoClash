-- Coins ledger + pack service (spec.md Sections 17/21, architecture.md Section 6's "Coins ledger" /
-- "Pack service"). STATUS.md roadmap step 5 — this is what finally makes rarity/editions (0002) matter:
-- grantStartingCollection is narrowed in this same change to Commons only, so Uncommon-and-above now
-- only enters a collection through a pack.

alter table accounts add column if not exists coins_balance integer not null default 0;

create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  -- Positive = earn (welcome bonus, future quests/wins), negative = spend (packs, future crafting).
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists pack_openings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  pack_type text not null,
  coins_spent integer not null,
  -- Template ids pulled, in reveal order — one card_instance created alongside this row per entry.
  cards jsonb not null,
  -- The mulberry32 seed (engine/src/rng.ts) the roll was made with — same determinism-by-construction
  -- story as match replays: (seed, pack_type) always reproduces the same `cards`.
  seed bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists coin_transactions_account_id_idx on coin_transactions(account_id);
create index if not exists pack_openings_account_id_idx on pack_openings(account_id);
