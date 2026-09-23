-- Game-balance queries over the `matches` table (server/migrations/0014_matches.sql).
--
-- This file is NOT a migration and must never be moved into server/migrations/ — the migration
-- runner (server/src/migrate.ts) executes every *.sql file in that directory in name order. It
-- is reference documentation: paste a block into psql (or any SQL client pointed at
-- DATABASE_URL) to answer the question above it.
--
-- Everything below reads `matches` or the `match_seats` view the migration defines (the
-- row-per-seat unpivot of the same rows). Nothing here writes.
--
-- =============================================================================
-- READ THIS BEFORE QUOTING ANY NUMBER FROM THIS FILE
-- =============================================================================
--
-- 1. ONLINE PLAY ONLY. Play vs AI is entirely client-side and never reaches the match server,
--    so it is not in this table and never will be. Every "win rate" here is an online-play win
--    rate. Do not describe it as the game's win rate.
--
-- 2. FILTER ON end_reason. 'conclusion' is a real engine-decided result. 'forfeit' (Leave
--    clicked) and 'abandon' (disconnect grace period lapsed) both have an artificial winner, a
--    truncated turn count, and — for 'abandon' — a duration inflated by up to the full 45s
--    reconnect grace period. Including them in a win-rate or a duration average measures who
--    quits, not who wins. Every query below states which reasons it includes, and why.
--
-- 3. SEAT A IS NOT RANDOMLY ASSIGNED. This is the biggest caveat in the file. Seat A always
--    takes turn 1, so "A's win rate" is the first-player number — but seat A is also always the
--    player who was *already waiting in the FIFO queue* when the match was made
--    (createMatchServer.ts: `new MatchRoom(queue.shift(), session)`). Anything correlated with
--    having queued first is therefore confounded with going first. Off-peak players wait longer
--    and are more likely to be seat A; so is anyone who re-queues immediately after a match.
--    A first-player-advantage figure from this table is a *screening* number: if it comes back
--    near 50% the effect is probably small, and if it comes back at 58% that is a reason to
--    randomise seat assignment and measure again, NOT a measured coin-flip advantage. The fix
--    is one line in createMatchServer.ts (randomise which session becomes seat A) and it should
--    be made before anyone tunes anything on this number.
--
-- 4. SMALL SAMPLES. There is no traffic behind this table yet. Every query has a HAVING or a
--    count column so a 3-match 100% win rate is visibly a 3-match sample. Raise the thresholds
--    as volume arrives; do not delete them.
--
-- 5. Anonymous players are the common case (account_id is null). No query below joins to
--    `accounts`, on purpose — doing so would silently drop most of the data.
--
-- The `since` window in each query is a placeholder: replace `now() - interval '30 days'` with
-- the window you mean (typically "since the last balance change").


-- =============================================================================
-- Q1. Win rate by faction
-- =============================================================================
-- "Which faction wins more?" Seat-level, off match_seats, so each match contributes one row per
-- side. Draws count as half a win (the standard convention — a draw is neither side's win, and
-- dropping draws entirely would inflate the win rate of whichever faction draws most).
--
-- 'conclusion' only: a faction cannot be credited with a win its opponent handed it by quitting.
-- `faction_cards >= 21` (70% of a 30-card deck) restricts this to decks that really are the
-- archetype they are labelled — without it, two-faction pile decks get averaged into whichever
-- faction holds the plurality and every number drifts towards 50%. Drop the filter to see the
-- "as played, including piles" number; run it both ways if they disagree.
select
  faction,
  count(*)                                                        as matches,
  sum((result = 'win')::int)                                      as wins,
  sum((result = 'draw')::int)                                     as draws,
  round(
    (sum((result = 'win')::int) + 0.5 * sum((result = 'draw')::int)) * 100.0 / nullif(count(*), 0),
    1
  )                                                               as win_rate_pct,
  -- Decisiveness, not just frequency: average HP the seat had left when it won. Two factions can
  -- both sit at 52% while one wins at 1 HP and the other at 20 — only the second is a problem.
  round(avg(hp) filter (where result = 'win'), 1)                 as avg_hp_left_on_win
from match_seats
where ended_at >= now() - interval '30 days'
  and end_reason = 'conclusion'
  and faction_cards >= 21
group by faction
having count(*) >= 30          -- raise as volume allows; below this the number is noise
order by win_rate_pct desc;


-- =============================================================================
-- Q1b. Matchup matrix — faction vs faction
-- =============================================================================
-- The question Q1 cannot answer: a faction can sit at a healthy 51% overall while being
-- unplayable into one specific opponent. Read a row as "when <faction> met <opponent_faction>,
-- <faction> won win_rate_pct of the time". Every matchup appears twice (once from each side);
-- the two should sum to 100 and it is worth checking that they do as a sanity test of this view.
select
  faction,
  opponent_faction,
  count(*)                                                        as matches,
  round(
    (sum((result = 'win')::int) + 0.5 * sum((result = 'draw')::int)) * 100.0 / nullif(count(*), 0),
    1
  )                                                               as win_rate_pct
from match_seats
where ended_at >= now() - interval '30 days'
  and end_reason = 'conclusion'
  and faction_cards >= 21
  and faction <> opponent_faction
group by faction, opponent_faction
having count(*) >= 20
order by faction, win_rate_pct desc;


-- =============================================================================
-- Q2. Mean turns and duration — how long does a match actually take?
-- =============================================================================
-- Match-level (not seat-level), so straight off `matches`. 'conclusion' only: a forfeit's turn
-- count is "how long until someone quit", which is Q3's question, not this one.
--
-- Medians as well as means because both distributions are right-skewed — one 40-turn fatigue
-- grind drags the mean up and hides the typical experience. If mean and median disagree
-- sharply, trust the median and go look at p90.
--
-- think_seconds_per_turn is the number that decides whether "one more game" is a 4-minute
-- decision or a 15-minute one, which is the single biggest driver of session length.
select
  count(*)                                                                      as matches,
  round(avg(turns), 1)                                                          as mean_turns,
  percentile_cont(0.5) within group (order by turns)                            as median_turns,
  percentile_cont(0.9) within group (order by turns)                            as p90_turns,
  round(avg(duration_ms) / 1000.0, 1)                                           as mean_seconds,
  -- percentile_cont returns double precision, which round(v, n) has no overload for — hence the
  -- ::numeric casts here and nowhere else in this file.
  round((percentile_cont(0.5) within group (order by duration_ms) / 1000.0)::numeric, 1)
                                                                                as median_seconds,
  round((percentile_cont(0.9) within group (order by duration_ms) / 1000.0)::numeric, 1)
                                                                                as p90_seconds,
  round(avg(duration_ms / nullif(turns, 0)) / 1000.0, 1)                        as think_seconds_per_turn
from matches
where ended_at >= now() - interval '30 days'
  and end_reason = 'conclusion';

-- Same, split by faction pairing presence — "do Bulls games run long?" Uses match_seats so a
-- match is counted once per side; mean_turns is a match property, so this reports the average
-- length of matches *that faction was in*, not a per-seat quantity.
select
  faction,
  count(*)                              as matches,
  round(avg(turns), 1)                  as mean_turns,
  round(avg(duration_ms) / 1000.0, 1)   as mean_seconds
from match_seats
where ended_at >= now() - interval '30 days'
  and end_reason = 'conclusion'
  and faction_cards >= 21
group by faction
having count(*) >= 30
order by mean_turns desc;


-- =============================================================================
-- Q3. Abandon rate — how often does someone walk away?
-- =============================================================================
-- Match-level, and deliberately across ALL end reasons (that is the denominator). Two separate
-- numbers, because they mean different things and fixing them costs different money:
--   forfeit_pct — players choosing to quit. A game-design signal: unwinnable board states,
--                 boring matchups, a concede button that is too easy to reach.
--   abandon_pct — connections dying and never coming back. An infrastructure signal:
--                 reconnect logic, mobile backgrounding, hosting.
select
  count(*)                                                            as matches,
  sum((end_reason = 'conclusion')::int)                               as concluded,
  sum((end_reason = 'forfeit')::int)                                  as forfeited,
  sum((end_reason = 'abandon')::int)                                  as abandoned,
  round(sum((end_reason = 'forfeit')::int) * 100.0 / nullif(count(*), 0), 1)     as forfeit_pct,
  round(sum((end_reason = 'abandon')::int) * 100.0 / nullif(count(*), 0), 1)     as abandon_pct,
  -- When in the match do people quit? A median of 2 means they are quitting on the opening hand
  -- (a mulligan/matchmaking problem); a median of 15 means they quit once the game is decided
  -- (a "let me concede" UX problem, much less urgent).
  percentile_cont(0.5) within group (order by turns)
    filter (where end_reason in ('forfeit', 'abandon'))               as median_turns_at_quit
from matches
where ended_at >= now() - interval '30 days';

-- Who quits: by faction, and by whether the quitting seat was losing at the time. The quitting
-- seat is always the one that did NOT win a forfeit/abandon match, so `result = 'loss'` on
-- match_seats identifies it exactly.
select
  faction,
  count(*)                                                        as matches_played,
  sum((end_reason = 'forfeit' and result = 'loss')::int)           as times_forfeited,
  sum((end_reason = 'abandon' and result = 'loss')::int)           as times_abandoned,
  round(
    sum((end_reason in ('forfeit', 'abandon') and result = 'loss')::int) * 100.0 / nullif(count(*), 0),
    1
  )                                                                as quit_pct
from match_seats
where ended_at >= now() - interval '30 days'
  and faction_cards >= 21
group by faction
having count(*) >= 30
order by quit_pct desc;


-- =============================================================================
-- Q4. First-player advantage — is going first worth anything?
-- =============================================================================
-- *** Read caveat 3 at the top of this file before using this number. Seat A is confounded
-- *** with "queued first"; this screens for an effect, it does not measure one.
--
-- Seat A always takes turn 1 (engine.ts: createMatch sets activePlayer: "A"), so this is simply
-- seat A's win rate. 'conclusion' only, for the usual reason — a forfeit's winner is decided by
-- who quit, not by who moved first, and forfeits are not symmetric between the seats either
-- (the player who queued first has been sitting at the screen longer).
--
-- A rough significance check, so the result is not read off a 40-match sample: the standard
-- error of a proportion is sqrt(0.25/n), i.e. ~1.6 percentage points at n=1000 and ~5 points at
-- n=100. `se_pct` below is that; treat the effect as real only if
-- abs(first_player_win_pct - 50) exceeds roughly 2 * se_pct.
select
  count(*)                                                                      as matches,
  sum((winner = 'A')::int)                                                      as first_player_wins,
  sum((winner = 'B')::int)                                                      as second_player_wins,
  sum((winner = 'Draw')::int)                                                   as draws,
  round(
    (sum((winner = 'A')::int) + 0.5 * sum((winner = 'Draw')::int)) * 100.0 / nullif(count(*), 0),
    1
  )                                                                             as first_player_win_pct,
  round((sqrt(0.25 / nullif(count(*), 0)) * 100)::numeric, 1)                              as se_pct,
  -- Does going first only matter in fast games? If the advantage concentrates in short matches
  -- it is a tempo problem (the extra turn never gets paid back); if it persists into long ones
  -- it is a card-advantage problem.
  round(
    (sum((winner = 'A')::int) filter (where turns <= 10)) * 100.0
      / nullif(count(*) filter (where turns <= 10), 0),
    1
  )                                                                             as first_player_win_pct_short_games
from matches
where ended_at >= now() - interval '30 days'
  and end_reason = 'conclusion';

-- The same question controlled for faction, since the seat-assignment confound above may not be
-- uniform across factions: if going first is worth 5 points for one faction and 0 for another,
-- that is a real design finding regardless of the queue-order caveat.
select
  faction,
  count(*) filter (where went_first)                                            as as_first_player,
  round(
    (sum((result = 'win')::int) filter (where went_first)
      + 0.5 * sum((result = 'draw')::int) filter (where went_first)) * 100.0
      / nullif(count(*) filter (where went_first), 0),
    1
  )                                                                             as win_pct_going_first,
  count(*) filter (where not went_first)                                        as as_second_player,
  round(
    (sum((result = 'win')::int) filter (where not went_first)
      + 0.5 * sum((result = 'draw')::int) filter (where not went_first)) * 100.0
      / nullif(count(*) filter (where not went_first), 0),
    1
  )                                                                             as win_pct_going_second
from match_seats
where ended_at >= now() - interval '30 days'
  and end_reason = 'conclusion'
  and faction_cards >= 21
group by faction
having count(*) >= 60
order by faction;


-- =============================================================================
-- Q5. Volume, for sanity — is this table receiving anything at all?
-- =============================================================================
-- Run this first. If it is empty, nothing below it means anything: either DATABASE_URL is unset
-- on the match server (matchRoom.ts's recording is a silent no-op then, by design), or nobody
-- is playing online.
select
  date_trunc('day', ended_at)::date                 as day,
  count(*)                                          as matches,
  sum((end_reason = 'conclusion')::int)             as concluded,
  count(*) filter (where a_account_id is not null
                      or b_account_id is not null)  as with_at_least_one_account
from matches
where ended_at >= now() - interval '30 days'
group by 1
order by 1 desc;
