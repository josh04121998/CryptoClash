# CryptoClash — Battle Playtest Rubric

**Owner:** TCG (product)  
**Priority:** Battle-first retention (Josh, 2026-09-09)  
**Goal:** Decide whether the *match* is sticky enough before we spend more on collect / on-chain.  
**Modes:** Prefer **Play vs AI** (no wallet). Add **Play Online** only if a second human is available.

---

## 1. Protocol

| Item | Default |
|------|---------|
| Players | Josh + ideally 3–5 people who have never played (or only once) |
| Matches per player | **10** (minimum 6 if time-boxed) |
| Deck mix | At least 3 different starter factions across the 10 games |
| Wallet | **Not required** for Vs AI. Skip Online if wallet friction would bias the test. |
| Note-taking | One row per match in the log table below (phone notes fine) |

Before match 1, tell the player only:

> “It’s a card battler. Spend Energy to play cards. Reduce the enemy to 0 HP. Figure the rest out.”

No coaching unless they are stuck >60s on a single action.

---

## 2. Per-match scorecard (1–5)

Score immediately after each match. **3 = acceptable; 4+ = good.**

| # | Dimension | 1 | 3 | 5 |
|---|-----------|---|---|---|
| A | **Decision density** | Most turns: play everything or pass | Some turns matter | Almost every turn had a real trade-off |
| B | **Outcome clarity** | No idea why I won/lost | Rough sense | Can point to 1–2 decisive turns |
| C | **Faction fantasy** | Felt generic | One cool moment | Deck identity showed by ~turn 5 |
| D | **Feedback / juice** | Unsure what happened | Readable | Hits, Guard, turn handoff feel crisp |
| E | **Want another?** | Done | Maybe later | Queue again now |

**Match score** = average of A–E.

---

## 3. Binary flags (yes/no each match)

Check any that applied:

- [ ] **Afford-whole-hand** — mid/late game I could play my entire hand in one turn with leftover Energy and no interesting skip
- [ ] **Guard opaque** — I attacked face / wrong target because Guard wasn’t obvious
- [ ] **Market Event felt unfair** — swing felt random/punishing, not exciting
- [ ] **Bot felt unfair / brain-dead** — either free win or impossible for wrong reasons
- [ ] **Rules confusion** — I needed to ask what a keyword/UI meant mid-match
- [ ] **Soft lock / UI bug** — couldn’t take an intended legal action

---

## 4. Free-text (2 lines max)

- Best moment:
- Worst moment:

---

## 5. Aggregate pass bar (“battle ready enough to layer collect”)

After all matches for a cohort:

| Gate | Pass if |
|------|---------|
| Stickiness | Median **E (Want another?) ≥ 3.5** |
| Decisions | Median **A ≥ 3.5**; **Afford-whole-hand** on **&lt;30%** of matches |
| Clarity | Median **B ≥ 3.5**; **Rules confusion** on **&lt;20%** of matches |
| Guard | **Guard opaque** on **&lt;15%** of matches |
| Bot (Vs AI) | **Bot unfair/brain-dead** on **&lt;25%** of matches |

**Pass** = all gates green → OK to schedule collect/on-chain work *without* pausing battle.  
**Soft fail** = one gate red → fix that slice before new economy features.  
**Hard fail** = stickiness or decisions red → battle is still the only priority.

---

## 6. Log template

| Match | Mode | Faction | Result | A | B | C | D | E | Flags | Best | Worst |
|-------|------|---------|--------|---|---|---|---|---|-------|------|-------|
| 1 | AI | Normies | W/L | | | | | | | | |
| 2 | | | | | | | | | | | |

---

## 7. What to do with results

1. TCG aggregates medians + top 3 recurring flags.  
2. One-page “Battle fix list” ranked by retention impact.  
3. Hand Eng only items that change *next-match* fun (not polish for its own sake).

---

## 8. Out of scope for this rubric

Pack odds, crafting, referrals, wallet UX, art quality (unless it blocks reading Attack/Health/Guard), token/chain.
