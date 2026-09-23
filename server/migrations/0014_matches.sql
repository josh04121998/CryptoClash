-- Durable match records (session 33 telemetry work, task C). Until now a finished match left
-- no record of itself anywhere: `matchRoom.ts` wrote a zero-amount `coin_transactions` row per
-- *account* purely to keep leaderboardRepo.ts's win/loss aggregates working (see coinsRepo.ts's
-- `awardMatchResult` doc comment), plus rank/achievement/quest updates. That side-effect trail
-- is per-account and outcome-only, so none of the questions game balance actually needs are
-- answerable from it: how long matches run, whether a faction over-performs, how often a player
-- walks away, whether going first wins. This table exists to answer exactly those four, and the
-- documented queries for them live in `server/sql/match_balance.sql`.
--
-- Same "first design pass, nothing tuned against it" caveat as every economy constant in this
-- codebase (0007's header, match rewards, pack odds, Dust values) — the point of this table is
-- to stop that being true.
--
-- Scope, stated plainly: **Play Online only**. Play vs AI runs entirely client-side with no
-- server-validated outcome and never reaches `matchRoom.ts` at all, so it can never appear here.
-- Any win-rate computed off this table is an online-play win rate and nothing else. The
-- client-side telemetry event stream (0013_analytics_events.sql, `match_started`/`match_ended`
-- with `mode`) is the only place AI matches are visible, and those are self-reported by an
-- untrusted client — never join the two and present the result as one number.
--
-- Privacy: `account_id` (internal uuid) is the only identity stored, matching the telemetry
-- contract's no-PII rule. No wallet address, no IP, no user agent, and deliberately no
-- reconnect token or session id (both are per-match secrets with no analytical value).

-- ---------------------------------------------------------------------------
-- Shape: one row per match, with A_/B_ seat columns — NOT one row per seat.
-- ---------------------------------------------------------------------------
-- This was the main design call, so the reasoning is written down rather than assumed:
--
-- 1. The write is fire-and-forget. Every telemetry write in `matchRoom.ts` is `.catch(() => {})`
--    — it must never crash a match or change its outcome — and nothing retries it or ever
--    notices it failed. One row per seat means two inserts, and a *partial* failure would leave
--    a half-recorded match that silently skews every aggregate afterwards (one seat's faction
--    counted, its opponent's not; a "match" whose sides don't sum). Avoiding that means a
--    transaction inside an unobserved catch — more moving parts in the one path that is not
--    allowed to affect the game. A single-statement INSERT is atomic by construction: the match
--    is either fully recorded or not recorded at all, which is the only two states an analyst
--    can reason about safely.
--
-- 2. Two seats is an invariant, not a current limitation. `PlayerId` is the literal union
--    `"A" | "B"` throughout the engine and `MatchRoom` holds `Record<PlayerId, Session>`; a
--    third seat would be a rewrite of the engine, not a schema migration. The usual argument
--    for row-per-seat — "N players, don't bake the count into the columns" — does not apply.
--
-- 3. Match-level facts (turns, duration, end_reason, winner) belong to the match, not a seat.
--    Row-per-seat either duplicates all four on both rows (two copies that can disagree) or
--    needs a second parent table, i.e. 2 tables and 3 inserts for a best-effort write.
--
-- 4. First-player advantage — a headline question here — is a single column comparison in this
--    shape (`winner = 'A'`), and a self-join or a window function in the other.
--
-- The real cost of this shape is that per-seat questions ("win rate by faction") need the two
-- halves unpivoted. That cost is paid once, below, by the `match_seats` view: analytics read
-- seat-shaped rows exactly as they would against a row-per-seat table, while the write stays a
-- single atomic statement. Both properties, one table.

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),

  -- --- Outcome -------------------------------------------------------------
  -- The engine's own verdict (`MatchState.winner`), by seat. 'Draw' is a real engine outcome
  -- (mutual lethal / double fatigue), not a "no result" placeholder — a row only ever exists
  -- for a match that actually reached a decision, so this is `not null`. Stored as the seat
  -- letter rather than an account id because a match can be fully anonymous on both sides, and
  -- because "which *seat* won" is the first-player-advantage question.
  winner text not null check (winner in ('A', 'B', 'Draw')),

  -- How the match ended. Every aggregate below has to be filterable on this, because the three
  -- are not comparable: a forfeited match has an artificial winner, an unnatural turn count and
  -- (for 'abandon') a duration inflated by the reconnect grace period.
  --   'conclusion' — a real engine-decided end: someone's HP hit 0, or fatigue/mutual lethal
  --                  produced a Draw. `MatchRoom.conclude()`. The only rows a balance question
  --                  about *the game* should usually look at.
  --   'forfeit'    — a deliberate concession: the player clicked "Leave", which ends the match
  --                  for the opponent immediately with no grace period. `handleLeave()`.
  --   'abandon'    — a socket dropped and the reconnect grace period lapsed with nobody coming
  --                  back. `handleDisconnect()`'s timer. Distinct from 'forfeit' on purpose:
  --                  one is a player choosing to quit (a game-design signal — boring matchups,
  --                  unwinnable board states), the other is a connection dying (an
  --                  infrastructure signal). Conflating them makes both numbers useless.
  -- 'forfeit'/'abandon' rows are also where the *loser* is knowable without ambiguity: the
  -- forfeiting seat is always the one that is not `winner`.
  end_reason text not null check (end_reason in ('conclusion', 'forfeit', 'abandon')),

  -- --- Pace ----------------------------------------------------------------
  -- `MatchState.turnNumber` at the end. The core pace metric: the difference between a 6-turn
  -- and a 20-turn average game is the difference between two entirely different games, and it
  -- is the number every future card-cost change should be checked against. Turns rather than
  -- "rounds" because that is the counter the engine actually keeps.
  turns integer not null,

  -- Wall-clock milliseconds from room creation (both seats filled, `matchFound` sent) to the
  -- end event. Kept *alongside* `turns`, not instead of it, because they answer different
  -- questions: `turns` is game length, `duration_ms` is how long a human actually sat there,
  -- and the ratio of the two is think-time — the thing that decides whether an online match is
  -- a 4-minute commitment or a 15-minute one.
  -- Caveat, stated here because it will otherwise be rediscovered as a bug: for
  -- end_reason = 'abandon' this includes up to the full reconnect grace period
  -- (RECONNECT_GRACE_MS, 45s) of dead time waiting for a reconnect that never came. Filter to
  -- end_reason = 'conclusion' for any duration average meant to describe play.
  duration_ms integer not null,

  -- --- Seats ---------------------------------------------------------------
  -- Seat A is always the player who was already waiting in the FIFO queue, and seat A always
  -- takes turn 1 (`createMatch` sets `activePlayer: "A"`). Both facts matter for reading the
  -- first-player-advantage number — see the warning in server/sql/match_balance.sql.
  --
  -- `null` = an anonymous player (no wallet linked). Anonymous play is fully supported and is
  -- expected to be most of the funnel pre-wallet, so this is the common case, not an edge one:
  -- faction/pace/abandon questions must all work with no account on either side. Only
  -- per-player questions ("does this account abandon a lot") need a non-null id.
  --
  -- `on delete set null`, deliberately different from the `on delete cascade` every other
  -- account-scoped table in this schema uses (0005's quest_progress, 0007's
  -- achievement_progress/rank_points_transactions). Those tables *are* a player's data and
  -- should leave with them. A match record is a record of a game between two people; deleting
  -- one participant's account must not silently delete their opponent's match history or
  -- retroactively rewrite the game's balance statistics. Setting it null degrades the row to
  -- exactly what an anonymous seat already looks like — which loses the identity (the point of
  -- a deletion) while keeping the gameplay facts.
  a_account_id uuid references accounts(id) on delete set null,
  b_account_id uuid references accounts(id) on delete set null,

  -- The seat's deck archetype, derived server-side from the 30 card ids the seat actually
  -- played with (`matchesRepo.ts`'s `deckFaction`), captured at room creation. Not taken from
  -- `accounts.starting_faction` (0009) — that is the one-time free-collection choice and says
  -- nothing about what deck was brought to *this* match — and not trusted from the client,
  -- which never sends a faction at all. 'Neutral' is a legitimate value: a legal deck of
  -- nothing but Neutral staples has no faction.
  a_faction text not null,
  b_faction text not null,

  -- How many of the seat's 30 cards belong to `*_faction`. A custom deck can be a two-faction
  -- pile, and the plurality label alone would present it as a pure archetype. One smallint per
  -- seat makes the difference visible: `where a_faction_cards >= 21` restricts a win-rate query
  -- to decks that really are the faction they're labelled, instead of quietly averaging
  -- archetypes together and concluding nothing. Cheap, and impossible to reconstruct later.
  a_faction_cards smallint not null,
  b_faction_cards smallint not null,

  -- Final player HP. Win rate says *whether* a matchup is lopsided; the winner's remaining HP
  -- says *how much*, which is what tells a 51%-but-always-by-1-HP matchup (fine) apart from a
  -- 51%-but-always-a-blowout one (not fine). Two smallints, unreconstructable after the fact,
  -- and the only decisiveness signal available without storing full match logs.
  -- Starts at 30 (MAX_PLAYER_HP) and is **not** clamped at 0 — the losing seat's value is
  -- usually negative, because the killing blow's overkill is recorded as-is (matchOps.ts's
  -- checkWin only tests `hp <= 0`). That is useful, not a bug: -9 means a lethal that was 9
  -- points bigger than it needed to be. `not null` and signed for exactly that reason; use
  -- `greatest(hp, 0)` if a query wants the clamped version.
  -- Meaningless-but-harmless on forfeits: it is simply the HP at the moment the seat quit.
  a_hp smallint not null,
  b_hp smallint not null,

  -- --- Time ----------------------------------------------------------------
  -- `started_at` is room creation, `ended_at` is when the match ended (which, since the insert
  -- is fired synchronously at that instant, is also effectively the row's creation time).
  -- Both, not just one plus the duration, so a match can be bucketed by when it *started*
  -- (time-of-day/session cohorting) without arithmetic, and so a queue-time or concurrency
  -- question can be answered later from overlapping [started_at, ended_at] windows.
  started_at timestamptz not null,
  ended_at timestamptz not null default now()
);

-- The one index, on the filter every query below opens with ("matches since <date>") — balance
-- questions are always asked about a window, because the answer before and after a card change
-- is the entire point. Deliberately *not* indexing a_faction/b_faction/a_account_id/b_account_id,
-- following 0008's stated rule of only indexing a demonstrated read path: the faction queries
-- aggregate over the whole window anyway (a scan, index or not), and no per-account match
-- history endpoint exists yet. Add those when something actually reads them.
create index if not exists matches_ended_at_idx on matches(ended_at);

-- ---------------------------------------------------------------------------
-- match_seats — the row-per-seat view of the same data.
-- ---------------------------------------------------------------------------
-- Unpivots each match into its two seats so per-seat analytics (win rate by faction, per-account
-- abandon rate) are a plain `group by`, with no UNION written by hand at every call site. This
-- is the half of the row-per-seat design that was worth keeping; the write side stays a single
-- atomic INSERT. `result` is pre-computed from the seat's own point of view because "did *this*
-- seat win" is the predicate every seat-level question needs, and `opponent_faction` is carried
-- across so matchup matrices (faction vs faction) work off this view alone.
-- `create or replace` rather than `if not exists` so a later change to this file's definition
-- actually takes effect on a database that already ran an earlier version of it.
create or replace view match_seats as
  select
    m.id as match_id,
    'A'::text as seat,
    m.a_account_id as account_id,
    m.a_faction as faction,
    m.a_faction_cards as faction_cards,
    m.a_hp as hp,
    m.b_faction as opponent_faction,
    m.b_hp as opponent_hp,
    case when m.winner = 'A' then 'win' when m.winner = 'Draw' then 'draw' else 'loss' end as result,
    -- True for the seat that took turn 1. A constant per branch here, but naming it means the
    -- first-player question reads the same in seat-shaped queries as in match-shaped ones.
    true as went_first,
    m.end_reason,
    m.turns,
    m.duration_ms,
    m.started_at,
    m.ended_at
  from matches m
  union all
  select
    m.id,
    'B'::text,
    m.b_account_id,
    m.b_faction,
    m.b_faction_cards,
    m.b_hp,
    m.a_faction,
    m.a_hp,
    case when m.winner = 'B' then 'win' when m.winner = 'Draw' then 'draw' else 'loss' end,
    false,
    m.end_reason,
    m.turns,
    m.duration_ms,
    m.started_at,
    m.ended_at
  from matches m;
