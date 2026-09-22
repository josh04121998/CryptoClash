-- Creature card rename, following the faction recast in 0010.
--
-- Doggos and Frogs name the species in every one of their 17 creature cards
-- (Shield Pup, Moon Dog, Glitch Toad, Deep Croak...). The four recast factions
-- did not: their creatures still carried human job titles, so a bear cub was
-- called "Junior Dev". This renames all 27 creatures that were not already
-- carrying their species. Spells, items and secrets keep their crypto-slang
-- names untouched (Rug Pull, Margin Call, Crunch Time, To The Moon...), and
-- Degen Ape, Bull Run and Steadfast Tabby already read correctly.
--
-- Template ids are plain text in two places, both of which need rewriting or a
-- player's owned copies and saved decks stop resolving against CARD_POOL:
--
--   card_editions.template_id -- one row per (template, edition); owned copies
--                                hang off it via card_instances.edition_id
--   decks.cards               -- a jsonb array of template ids, one per copy

create temporary table card_renames (old_id text primary key, new_id text not null) on commit drop;

insert into card_renames (old_id, new_id) values
  -- Bears
  ('junior_dev',        'cub_dev'),
  ('code_grinder',      'grizzly_grinder'),
  ('ship_it',           'ship_it_bruin'),
  ('scaffold_bot',      'scaffold_kodiak'),
  ('efficient_engineer','efficient_ursa'),
  ('rapid_prototype',   'prototype_cub'),
  ('modular_frame',     'modular_panda'),
  ('iteration_cycle',   'iterating_bruin'),
  ('full_stack_titan',  'full_stack_grizzly'),
  ('unicorn_startup',   'unicorn_ursa'),
  -- Apes
  ('diamond_hands',     'diamond_gorilla'),
  ('overleveraged',     'overleveraged_gibbon'),
  ('leverage_trade',    'leverage_mandrill'),
  ('blown_account',     'blown_out_chimp'),
  ('liquidated_ledger', 'liquidated_macaque'),
  ('moonshot',          'moon_ape'),
  ('exit_liquidity',    'exit_silverback'),
  -- Bulls
  ('hodl_wallet',       'hodl_bull'),
  ('angel_investor',    'angel_bull'),
  ('whale_wallet',      'whale_longhorn'),
  ('compound_interest', 'compound_brahman'),
  ('unicorn_exit',      'unicorn_bull'),
  -- Cats
  ('steady_hand',       'steady_paw'),
  ('safe_harbor',       'harbor_tom'),
  ('adaptive_trader',   'adaptive_siamese'),
  ('old_reliable',      'old_alley_cat'),
  ('community_shield',  'community_clowder');

update card_editions e
set template_id = r.new_id
from card_renames r
where e.template_id = r.old_id;

-- Rewrite every matching entry of each deck's jsonb array in one pass. The
-- join to card_renames leaves non-renamed ids untouched, and the outer filter
-- means a deck with no renamed card is never rewritten at all.
update decks d
set cards = (
  select jsonb_agg(coalesce(to_jsonb(r.new_id), elem) order by ord)
  from jsonb_array_elements(d.cards) with ordinality as t(elem, ord)
  left join card_renames r on r.old_id = (elem #>> '{}')
)
where exists (
  select 1
  from jsonb_array_elements(d.cards) as t(elem)
  join card_renames r on r.old_id = (elem #>> '{}')
);
