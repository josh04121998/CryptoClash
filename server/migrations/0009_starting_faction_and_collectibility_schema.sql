-- STATUS.md's queued "start here next session" items 1 and 3.

-- Item 1: a chosen starting faction replaces the old "every faction's
-- Commons, forever" grant (collectionRepo.ts's grantStartingCollection).
-- Nullable and never backfilled — accounts that signed in before this
-- migration already own every faction's Commons under the old scheme and
-- keep them; they're just not auto-topped-up via the new faction-scoped path
-- until they explicitly choose one via POST /api/starting-faction.
alter table accounts add column if not exists starting_faction text
  check (starting_faction in ('Doggos', 'Frogs', 'Degens', 'CryptoBros', 'Builders', 'Normies'));

-- Item 3a (collectibility.md Section 10/13's recommendation, signed off):
-- First Edition becomes a stackable per-instance flag (same shape as
-- is_foil) instead of a rung on the edition_type ladder, so a Founders Set
-- print can be "First Edition Secret Edition" at once, matching how the
-- real hobby stacks these. edition_type's own vocabulary is renamed to
-- collectibility.md Section 4 (Standard/Full Art/Ultra/Secret) — nothing in
-- the codebase has ever inserted 'first_edition', 'legendary', or 'genesis'
-- (grep-confirmed before writing this migration; only 'standard' is used),
-- so dropping them from the constraint is safe with no data migration.
alter table card_editions drop constraint if exists card_editions_edition_type_check;
alter table card_editions add constraint card_editions_edition_type_check
  check (edition_type in ('standard', 'full_art', 'ultra', 'secret'));

alter table card_instances add column if not exists is_first_edition boolean not null default false;

-- Item 3b (collectibility.md Section 7, recommendation 3, signed off): the
-- Condition/Floor Grade axis, a permanent 1-10 roll assigned once at mint.
-- Schema only, per STATUS.md's "needed before any of it gets built" framing
-- — nothing rolls or reads this column yet (no roll-at-grant logic, no UI).
-- Nullable: existing instances predate this axis and were never graded.
alter table card_instances add column if not exists condition_grade smallint
  check (condition_grade is null or (condition_grade between 1 and 10));
