# Floorwars — Playtest Results (2026-09-30)

**Method:** 6 full "Play vs AI" matches played to a real conclusion (win, loss, or draw — none abandoned), one per faction, against the local dev build (`localhost:5176`, same code as production). Played turn-by-turn via the Claude-in-Chrome browser extension with real screenshots at every decision point — no scripted/fixed clicks, no shortcuts. Same rubric as STATUS.md's session-26 playtest and the one the external "Go-Live Gap Analysis" brief cites (`PLAYTEST_RESULTS_2026-09-17.md`, not present on this machine and not independently verifiable): **Decisions, Clarity, Faction feel, Juice, Want another**, each scored 1–5.

Record: **2 wins, 4 losses** — a real, unscripted spread against the bot, not cherry-picked.

## Scores

| Faction | Result | Decisions | Clarity | Faction feel | Juice | Want another |
|---|---|---|---|---|---|---|
| Doggos | Loss (0–27) | 4 | 3 | 4 | 3 | 4 |
| Frogs | **Win** (4–0) | 4 | 4 | 4 | 4 | 5 |
| Apes | Loss (-1–4) | 5 | 3 | 5 | 4 | 5 |
| Bulls | Loss (-4–10) | 2 | 3 | 3 | 3 | 3 |
| Bears | **Win** (1–0) | 4 | 3 | 4 | 4 | 5 |
| Cats | Loss (0–26) | 3 | 4 | 5 | 3 | 4 |
| **Average** | | **3.67** | **3.33** | **4.17** | **3.5** | **4.33** |

**Against the Sep 17 gate cited in the external brief (Want another ≥3.5, Decisions ≥3.5, Clarity ≥3.5):** Want another and Decisions both clear the bar today; Clarity comes in at 3.33, just short — and the reason is a specific, reproducible bug (below), not a vague "confusing" impression.

## Bugs found (concrete, reproducible)

1. **Guard-target validity isn't shown before you click, only after.** When an enemy has a Guard creature, every enemy creature still highlights as if attackable (a general "combat mode" red border, not per-target validity). Attacking a non-Guard target shows a real error ("Enemy has a Guard creature — it must be attacked first") only *after* the click. Hit this in 3 of 6 matches (Doggos, Bulls, indirectly Bears) — a consistent, real pattern, not a one-off misclick. The fix is straightforward: only highlight the Guard creature itself as a valid target when one is present.
2. **Stale card rules-text still says the pre-rename faction names.** Confirmed on two different cards: **Bull Run** ("Gain +1 Attack while next to another **Crypto Bro**") and **Modular Panda** ("Gain +1 Attack while next to another **Builder**"). These are the *old* faction names (Crypto Bros → Bulls, Builders → Bears, per session 26's animal recast) — the engine's data/logic uses the new names correctly, but at least these two cards' own tooltip text was never updated. Given the pattern (adjacency-buff cards specifically), likely more exist across the pool; worth a full grep of card text for `Crypto Bro`, `Builder`, `Degen`, `Normie`.
3. **Drag-and-drop is the only way to play a card — tapping does nothing, silently.** A single click/tap on a hand card does not play it (confirmed repeatedly: no error, no feedback, just nothing happens). Only a real drag from the hand card onto a board slot (or the enemy portrait, for a targeted spell) works. Nothing in the UI signals this — a new player's first instinct (tap the card) simply fails with no explanation. This was the single biggest friction point in the very first minutes of the very first match.
4. **Minor: several drags failed silently even with the correct gesture** (roughly 1 in 8 attempts across the session) — no error, the card just stays in hand. Not consistently reproducible enough to isolate a cause (possibly a hitbox/timing issue with the automation, possibly real), but worth a human's own pass to confirm it isn't happening to real players too.

## What's working well

- **Market Events are genuinely clear.** Both a PUMP and a BLACK SWAN event fired during this session and both announced themselves with an unambiguous toast banner naming the exact effect ("PUMP — all creatures gain +1 Attack this turn"). No confusion either time.
- **Keyword tooltips are good.** Hovering/selecting a Stealth, Guard, or adjacency-buff creature shows a clear, correctly-worded explanation every time (modulo finding #2 above).
- **Tap-to-inspect works well** for reading a board minion's full text — used it several times mid-match with no friction.
- **Deathrattle payoffs land.** Alpha Dog dying and immediately spawning a Puppy (Doggos match) was a real, felt moment — exactly the kind of thing that makes a card feel worth playing.
- **The match log (once opened) is excellent** — fully readable, plain-English combat resolution ("Prototype Cub (slot 2) trades with Guard (slot 4): 4 <-> 3 damage."). It's just not open by default, so a player has to know to check it.

## Faction feel, ranked by how vividly each identity actually showed up in play

1. **Cats (5/5)** — the standout. 30 HP untouched for 6 straight turns before finally cracking. "Simple, sturdy, defensive, hard to punish" wasn't just marketing copy, it was directly, repeatedly experienced.
2. **Apes (5/5)** — "pay your own HP for explosive power" was viscerally real: both I and the bot nearly killed ourselves racing, self-damage numbers popped constantly, the tension was the whole point and it worked.
3. **Doggos (4/5)** and **Bears (4/5)** — swarm/adjacency and card-draw/value respectively both came through clearly (visible +1 Attack buffs stacking on adjacent Doggos; a consistently 6-7-card hand from Bears' draw effects).
4. **Frogs (4/5)** — the "copy your best creature" mechanic was fun and distinctive, though its adjacency-buff sub-theme (Glitch Toad) reads similarly to Doggos' own adjacency buff — a minor identity-overlap worth a glance, not urgent.
5. **Bulls (3/5)** — the ramp fantasy ("scale out of control") is real by turn 5-6, but turn 1 is *always* a dead turn (nothing in the opening hand ever costs 1), which reads as "nothing to do" rather than "ramping with purpose." This is the same weak-early-pressure finding the historical Sep 17 playtest flagged, reproduced directly today.

## Bottom line

The two clean gate metrics (Decisions 3.67, Want another 4.33) suggest the core loop is in meaningfully better shape than the Sep 17 snapshot the external brief cites. Clarity, at 3.33, is the one still short of the bar — but unlike a vague "the game is confusing" verdict, this session traced it to one specific, fixable interaction bug (Guard-target highlighting) plus a handful of stale card-text strings. Bulls' early-game flatness is also real and reproducible, not just a historical artifact. None of the four losses felt unfair or random — every one came down to a real board-state decision that could have gone the other way, which is itself a decent sign for "Decisions" as a category.
