-- Faction rename: four of the six factions become animals, so the whole cast
-- is the crypto bestiary rather than two animal factions plus four sets of
-- humans (branding.md Section 9.4, STATUS.md session 31).
--
--   Degens     -> Apes    ("aping in" is the degen verb)
--   CryptoBros -> Bulls   (permabulls)
--   Builders   -> Bears   ("builders build through the bear market")
--   Normies    -> Cats    (cat coins as the counter-tribe to the dog coins)
--
-- Doggos, Frogs and Neutral are unchanged.
--
-- accounts.starting_faction stores the faction as a bare string, so the old
-- names have to be rewritten in the data before the check constraint that
-- forbids them goes back on. Dropping the constraint first is what makes the
-- update legal; re-adding it afterwards is what keeps the column honest.
--
-- Order matters: drop -> update rows -> re-add. A rename that only swapped
-- the constraint would either fail outright or strand every existing player
-- on a faction name the engine no longer knows, which reads to them as
-- silently losing their starting collection grant.

alter table accounts drop constraint if exists accounts_starting_faction_check;

update accounts set starting_faction = 'Apes'  where starting_faction = 'Degens';
update accounts set starting_faction = 'Bulls' where starting_faction = 'CryptoBros';
update accounts set starting_faction = 'Bears' where starting_faction = 'Builders';
update accounts set starting_faction = 'Cats'  where starting_faction = 'Normies';

alter table accounts add constraint accounts_starting_faction_check
  check (starting_faction in ('Doggos', 'Frogs', 'Apes', 'Bulls', 'Bears', 'Cats'));

-- One card was named after its old faction and is renamed with it
-- (Steadfast Normie -> Steadfast Tabby). Its template id is stored as plain
-- text in two places, both of which need rewriting or a player's owned copies
-- and saved decks quietly stop resolving against CARD_POOL:
--
--   card_editions.template_id -- one row per (template, edition); owned copies
--                                hang off it via card_instances.edition_id, so
--                                updating this row carries every instance with it
--   decks.cards               -- a jsonb array of template ids, one entry per copy
update card_editions set template_id = 'steadfast_tabby' where template_id = 'steadfast_normie';

update decks
set cards = (
  select jsonb_agg(case when value::text = '"steadfast_normie"' then '"steadfast_tabby"'::jsonb else value end)
  from jsonb_array_elements(cards) as value
)
where cards @> '["steadfast_normie"]'::jsonb;

-- Same for Code Monkey -> Code Grinder. Renamed because "monkey" now collides
-- with the Apes faction: a card called Code Monkey sitting in the Bears deck
-- reads as a mis-filed Ape.
update card_editions set template_id = 'code_grinder' where template_id = 'code_monkey';

update decks
set cards = (
  select jsonb_agg(case when value::text = '"code_monkey"' then '"code_grinder"'::jsonb else value end)
  from jsonb_array_elements(cards) as value
)
where cards @> '["code_monkey"]'::jsonb;
