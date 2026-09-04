-- Stage 1 of architecture.md Section 6's data model: accounts + decks only.
-- No card_templates/editions/instances table yet — there's no rarity/collectible
-- layer yet (spec.md Sections 12-20), so every account can build a deck from the
-- full CARD_POOL in engine/src/cards.ts. That table arrives when collectibility does.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased, EIP-55-agnostic storage; always compare lowercased.
  wallet_address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  -- Card template ids, one array entry per copy (e.g. ["pup_scout","pup_scout",...]).
  -- Validated against engine's validateDeck() before every write — never trust this column's
  -- shape alone; a template id can be renamed/removed from CARD_POOL out from under a saved deck.
  cards jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decks_account_id_idx on decks(account_id);
