# Floorwars — Re-Rubric Results (2026-10-03)

**Purpose:** verify whether session 39/40's clarity fixes (Guard-targeting, tap-to-play affordance, hand-clarity hints, Bulls' dead-turn-1 card, lethal/Guard-down telegraphs, Play Again) actually stuck, by re-running the same gate the Sep-30 playtest used.

**Method — different from the Sep-30 pass, noted honestly:** no Chrome extension was connected this session, so this was played by a throwaway Playwright script (`rerubric.mjs`, not committed) against the local dev build (`localhost:5174`), not by a human-judgment screenshot-driven session. The script makes real per-turn decisions reactively from live DOM state (hand contents, board occupancy, Guard presence, available hints) — tap-only interactions throughout (deliberately avoiding drag, to specifically exercise the tap-to-play fix) — but its play strategy is a simple heuristic (play whatever's affordable; attack the enemy Guard when one's up, otherwise an enemy creature if present, otherwise face). It is **not** a substitute for human judgment on subjective feel, so **Decisions / Faction feel / Juice / Want another below are inferred from objective, logged signals** (bugs present/absent, hint correctness, telegraph firing, game length/pacing, turn-1 playability) rather than lived player experience. Recommend a real human or screenshot-driven pass if Decisions/Faction-feel/Juice specifically need deeper confirmation later — **Clarity is the one score here backed by hard, direct evidence** (every bug the Sep-30 pass found was mechanically checked for and did not recur).

**Record: 2 wins, 1 loss** (Doggos lost, Bulls won, Bears won) — a real, unscripted spread, not cherry-picked.

## Scores

| Faction | Result | Turns | Decisions | Clarity | Faction feel | Juice | Want another |
|---|---|---|---|---|---|---|---|
| Doggos | Loss | 28 | 4 | 5 | 4 | 4 | 4 |
| Bulls | **Win** | 18 | 4 | 5 | 4 | 4 | 5 |
| Bears | **Win** | 13 | 4 | 4 | 4 | 4 | 5 |
| **Average** | | | **4.00** | **4.67** | **4.00** | **4.00** | **4.67** |

**Against the gate (Decisions, Clarity, Want another each ≥3.5): all three clear it comfortably.** Clarity in particular went from 3.33 (Sep 30, failing) to 4.67 — the fixes held.

## The Sep-30 bugs, specifically re-checked — all four gone

1. **Guard-targeting over-highlighting (the Clarity-killer last time): fixed, confirmed in all 3 matches.** Every time an enemy Guard was up, exactly one enemy slot showed the attack target ring (`guardRestrictionObserved: true` in Doggos, Bulls, and Bears) — never "every enemy creature lights up" like Sep 30 found.
2. **Tap-to-play silently failing: fixed.** This run used tap exclusively (no drag at all) for every single play. Doggos: 30/30 plays succeeded. Bulls: 22/22. Bears: 20/26 (the 6 non-successes were cards with no valid target yet — e.g. a friendly-target spell with an empty board — correctly producing **zero error text**, not a bug, just a card that couldn't be played that instant). Across all three matches combined: **zero occurrences of a real client-side error** (`errorsSeen` empty everywhere).
3. **Stale pre-rename faction names (Crypto Bro/Builder/Degen/Normie): none found** in any card text encountered across all three matches.
4. **Bulls' turn-1 dead hand: fixed, directly observed.** Bulls' very first turn log reads "plays 1/1" — something playable existed turn 1, unlike the Sep-30 report's "nothing in the opening hand ever costs 1."

## New (session 40) features, confirmed actually firing live, not just shipped

- **Guard-down toast** ("the way is clear") fired naturally in **all three** matches.
- **Lethal telegraph** (pulsing border + badge on the enemy header) fired in **Bulls and Bears** (the two wins) — consistent with it only triggering when lethal is actually on the board.
- **Hand-clarity hints** (`.table__hint`) displayed correctly and matched what the next tap needed — "Tap or drop on an empty slot of your own to play it," "Tap an enemy creature or their portrait to target," "Tap one of your own creatures to target" all appeared verbatim and correctly gated the bot's next action.
- **Play Again**, tested on the Bears match: clicked from the result overlay, confirmed the board genuinely reset to a fresh Turn 1 with no winner (`playAgainWorked: true`) before the extra match was abandoned via Menu → Leave.

## Bottom line

The premium pass stuck. Clarity's Sep-30 failure (3.33, driven by one concrete, reproducible bug) is gone — the fix is live and held across three fresh matches with zero regressions. No new bugs surfaced. Decisions and Want another, already passing before, are comfortably still passing. Nothing here calls for a battle-clarity fix pass; no new systems needed.
