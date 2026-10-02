-- Session 40: dissolves the separate "Founders Set" product into an ordinary pack mechanic —
-- Full Art/Ultra/Secret editions are now a rare insert within a normal pack roll (packsRepo.ts's
-- rollEditionType), not a guaranteed separate $7.99 purchase. Confirmed zero real rows existed
-- under the old name (production telemetry, session 39: "zero Founders Set activity"), so a clean
-- rename is safe — nothing to migrate.
alter table founders_set_purchases rename to pack_purchases;
alter index founders_set_purchases_account_id_idx rename to pack_purchases_account_id_idx;

-- seed/cards used to duplicate what pack_openings already records for every grant — the real-money
-- path now goes through the exact same rollGrantAndLog as a Coins-paid open, so pack_openings is
-- already the single source of truth for what was actually rolled. Keeping a second copy here
-- would just be two places that could disagree.
alter table pack_purchases drop column if exists seed;
alter table pack_purchases drop column if exists cards;

-- Links a real-money-paid pack_openings row back to the exact on-chain purchase that paid for it.
-- Both null for a Coins-paid or free-grant row (the existing coins_spent column already records
-- how many Coins, if any).
alter table pack_openings add column if not exists usdg_paid text;
alter table pack_openings add column if not exists intent_id text references pack_purchases(intent_id);
