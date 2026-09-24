-- One-time Coins reward the first time an account's ranked points cross into a new tier
-- (session 34) — rankRepo.ts previously computed tiers purely for display (RANK_TIERS/
-- tierForPoints), with an explicit comment flagging that ranked play paid nothing at all. Every
-- other progression system in this codebase (quests, dailies, weeklies, achievements) pays
-- Coins; ranked was the one exception, not a deliberate design choice.
--
-- A dedicated table with a unique constraint, not a column on `accounts`, for the same reason
-- achievement_progress (0007) and quest_progress (0005) aren't columns either: the award is
-- naturally idempotent as an `insert ... on conflict do nothing` rather than a read-check-write
-- race, and it stays a real audit trail (who got what, when) instead of a single overwritten
-- "highest tier" number.
--
-- Bronze (RANK_TIERS[0], minPoints 0) is deliberately never a row here — it's where every
-- account starts, so "first reached" is meaningless for it. Only Silver/Gold/Platinum/Diamond
-- ever get inserted (rankRepo.ts's RANK_TIER_REWARDS).
create table if not exists rank_tier_rewards (
  account_id uuid not null references accounts(id) on delete cascade,
  tier_name text not null,
  coins_awarded integer not null,
  awarded_at timestamptz not null default now(),
  primary key (account_id, tier_name)
);
