-- Referral / invite system (viral growth lever) — added directly at the user's request:
-- "some sort of social invite feature eg free packs or free card to get the viral spread
-- going." See server/src/referralsRepo.ts for the full mechanic and its known limitations.

-- Lazily generated (see getOrCreateReferralCode) — most accounts never share theirs, so
-- there's no reason to burn a code for every sign-in; stays null until first requested.
alter table accounts add column if not exists referral_code text unique;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references accounts(id) on delete cascade,
  -- unique: an account can be *referred* by exactly one other account, ever, set once at
  -- that account's first-ever sign-in (never retroactively for an existing account).
  referred_id uuid not null unique references accounts(id) on delete cascade,
  -- 'pending' until the referred account completes its first Play Online match, then
  -- 'rewarded' (the referrer's free pack has been granted) — see rewardReferrerIfPending.
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);

create index if not exists referrals_referrer_id_idx on referrals(referrer_id);
