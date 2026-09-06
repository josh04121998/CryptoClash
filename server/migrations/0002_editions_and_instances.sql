-- Stage 2 of architecture.md Section 6's data model: card_editions + card_instances
-- (rarity & editions layer, STATUS.md roadmap step 4). No card_templates table —
-- gameplay identity stays in engine/src/cards.ts's CARD_POOL, same deviation already
-- made for decks.cards in 0001 (a template id can be renamed/removed from CARD_POOL
-- out from under a saved row; both tables are re-validated against it, never trusted
-- alone). template_id below is therefore a plain text column, not a foreign key.

create table if not exists card_editions (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  edition_type text not null check (edition_type in ('standard', 'first_edition', 'legendary', 'genesis')),
  artwork_ref text,
  max_supply integer,
  created_at timestamptz not null default now(),
  -- One row per (template, edition_type) — repo code upserts against this to
  -- find-or-create the "standard" edition it grants on every sign-in.
  unique (template_id, edition_type)
);

create table if not exists card_instances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  edition_id uuid not null references card_editions(id) on delete cascade,
  serial_number integer,
  is_foil boolean not null default false,
  -- Set once (and if) this instance is minted on-chain — see architecture.md Section 8.
  -- Off-chain rows with this null are the normal case for the entire MVP.
  onchain_token_id text,
  acquired_at timestamptz not null default now()
);

create index if not exists card_editions_template_id_idx on card_editions(template_id);
create index if not exists card_instances_owner_id_idx on card_instances(owner_id);
create index if not exists card_instances_edition_id_idx on card_instances(edition_id);
