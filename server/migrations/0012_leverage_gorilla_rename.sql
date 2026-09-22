-- Leverage Mandrill -> Leverage Gorilla.
--
-- A naming error from 0011, caught by reviewing the generated art. When every
-- creature was renamed to carry its species, this card was called "Leverage
-- Mandrill" to avoid repeating "Gorilla" (Diamond Gorilla already used it) --
-- but its prompt body still described a gorilla, so that is what generated.
-- The art is good; the name was wrong.
--
-- Repeating the species word is fine and on-convention: Doggos uses "Dog"
-- three times (Moon Dog, Guard Dog, Alpha Dog) and "Pup" three times, and
-- reads as a faction rather than a thesaurus.
--
-- Same two places as 0011: template ids are plain text in card_editions and
-- in each deck's jsonb array.

update card_editions set template_id = 'leverage_gorilla' where template_id = 'leverage_mandrill';

update decks
set cards = (
  select jsonb_agg(case when value::text = '"leverage_mandrill"' then '"leverage_gorilla"'::jsonb else value end order by ord)
  from jsonb_array_elements(cards) with ordinality as t(value, ord)
)
where cards @> '["leverage_mandrill"]'::jsonb;
