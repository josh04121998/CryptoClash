-- The DB-side idempotency guard for Founders Set purchases (collectibility.md Section 13 item 5,
-- server/src/foundersSetRepo.ts). FloorwarsStore.sol's own `purchased` mapping stops the same
-- on-chain intentId being paid twice; this table stops confirmFoundersSetPurchase granting cards
-- twice for one real payment if its own confirm route is ever called more than once for it (a
-- retry, a duplicate client request) — the same class of gap a bare on-chain check alone
-- wouldn't cover, since the contract has no idea whether this backend already acted on a payment
-- it already saw.
create table if not exists founders_set_purchases (
  intent_id text primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  amount_paid text not null, -- USDG's smallest unit, as a string (fits any real amount without a bigint/numeric overflow footgun)
  seed integer,
  cards jsonb,
  created_at timestamptz not null default now()
);

create index if not exists founders_set_purchases_account_id_idx on founders_set_purchases(account_id);
