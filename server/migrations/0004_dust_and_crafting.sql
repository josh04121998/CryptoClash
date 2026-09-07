-- Crafting service (spec.md Section 18, architecture.md Section 10's "Crafting service") —
-- converts duplicate card_instances into a spendable resource ("Dust"), closing the
-- duplicate-protection loop packs (0003) opened up: packs can now produce dupes and
-- foils, and until this migration nothing let a player do anything with them.
--
-- Same ledger shape as Coins (0003): a cached balance plus an append-only audit table.
-- Deliberately a fully separate resource from Coins, never interchangeable — architecture.md
-- Section 10's design has Coins buy packs, and Dust only come from disenchanting cards a
-- player already owns, so the two economies can't be conflated.

alter table accounts add column if not exists dust_balance integer not null default 0;

create table if not exists dust_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  -- Positive = earned (disenchanting a card), negative = spent (crafting a card).
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists dust_transactions_account_id_idx on dust_transactions(account_id);
