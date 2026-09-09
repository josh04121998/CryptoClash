# CryptoClash — First-Match Tutorial Spec

**Owner:** TCG (product) → hand to **TCG Eng**  
**Priority:** Battle-first (Josh, 2026-09-09)  
**Aligned with:** `batlleSpec.md` §34 First Match goal — *“Oh, I get it.”*  
**Status:** Ready for implementation

---

## 1. Problem

Launch modes in `spec.md` include **Tutorial**, but production today only has free **Play vs AI** (full rules, no teaching). New players bounce or play “mindlessly” because nobody teaches the turn loop or Guard.

## 2. Goals

After **one guided match**, a new player can:

1. Follow the turn loop: **Energy → Draw → Play → Attack → End**
2. Know **Energy** ramps and unused Energy does not bank
3. Play a creature into an **empty slot**
4. Understand **summoning sickness** (can’t attack the turn played) vs **Rush**
5. Attack **face** to win (reduce enemy HP to 0)
6. Respect **Guard** (must deal with Guard before free face attacks)

**Success feel:** “Oh, I get it.” — then they choose free Vs AI or Online on their own.

## 3. Non-goals

- Wallet / SIWE / saving decks  
- Packs, Coins, crafting, quests, referrals, leaderboard  
- Secrets, Deathrattle, Silence, Volatility deep-dive (optional one-line tooltip later)  
- Ranked / skill MM  
- Multi-language  
- Perfect balance of the tutorial match (favor clarity over fairness)

## 4. Constraints

| Constraint | Decision |
|------------|----------|
| Entry friction | **No wallet.** No login wall. |
| Skip | Always show **Skip tutorial** (confirm: “Jump to free play?”). Remember skip/complete in `localStorage`. |
| Stack | Existing React client + in-browser engine; **no server** required for tutorial. |
| Opponent | **Scripted coach bot** (fixed seed + scripted intents), not the full greedy AI — teaching moments must fire reliably. |
| Length | Target **4–7 minutes**, hard cap ~10. If player is slow, coach can soft-skip remaining beats after core 6. |
| Deck | **Fixed starter:** **Normies** sample deck (simple heal/defend fantasy; readable). Opponent: watered-down **Doggos** (swarm pressure + one Guard). |
| First visit | From **Landing → Play** (or first Main Menu visit): modal **“Learn the floor (2 min)”** / **“Skip”**. Returning completed users never see auto-modal. |

## 5. UX tone

Trading-floor voice, short, not condescending. Examples:

- “Energy’s up. Spend it or lose it.”  
- “New hires can’t swing yet — unless they’ve got **Rush**.”  
- “**Guard** is on the desk. Clear it before you hit their HP.”

## 6. Flow (beats)

### 6.0 Entry

1. User hits Play (or Continue from landing CTA).  
2. If `tutorialCompleted !== true` and `tutorialSkipped !== true` → offer tutorial.  
3. Accept → `mode = tutorial` (new). Skip → existing deck picker / Vs AI.

### 6.1 Pre-match (≤10s)

- Skip deck picker; lock Normies starter.  
- Short overlay: **“Goal: take them to 0 HP. One thing at a time.”** [Got it]

### 6.2 Scripted match — teaching moments (max 6 interrupts)

Interrupts are **blocking coach cards** (dim board, spotlight UI, one primary action). Player cannot proceed until they do the highlighted action (or tap Skip tip → advance script without teaching, still allowed).

| # | When | Teach | Spotlight | Required action |
|---|------|-------|-----------|-----------------|
| 1 | Start of player turn 1 (after Energy/Draw) | Energy available this turn | Energy pip | Play the highlighted 1-drop into the glowing empty slot |
| 2 | After that creature lands | Summoning sickness | That creature | Attempt attack → coach: “Not this turn.” Then highlight **End turn** |
| 3 | Player turn 2 | Ramp + attack | Energy (now 2) + enemy portrait | Play optional 2-drop *or* pass play; then attack **face** with any eligible creature (script ensures eligibility — e.g. give player a Rush token/creature on turn 2 if needed) |
| 4 | When enemy has played a Guard | Guard | Enemy Guard unit | Attack the Guard (illegal face clicks bounce with coach line) |
| 5 | After Guard dies / cleared | Face is open | Enemy HP | Attack face once |
| 6 | Once | Full loop reminder | End turn control | End turn; coach: “Energy → Draw → Play → Attack → End. That’s the floor.” |

**Script guarantees:**

- Enemy plays exactly one **Guard** creature on their first turn.  
- Player receives a **Rush** creature in hand by turn 2 (inject into hand if deck order fails — tutorial-only override).  
- Enemy AI does **not** lethal the player before beat 6; if player HP would drop below 10 early, script heals or softens.  
- Match can end naturally after beat 6 (player finishes the win) **or** coach offers **“Finish the fight”** / **“Exit to free practice”** once beats 1–6 done even if HP remain.

### 6.3 Exit

- On win/lose/concede after tutorial beats complete → **MatchResultOverlay** variant:  
  **“You’ve got the basics.”**  
  Buttons: **Practice vs AI** | **Main menu**  
- Set `tutorialCompleted = true`.  
- Optional secondary: “Play Online when you’re ready” (no push into wallet).

## 7. UI requirements

- Reuse `MatchView` with a `tutorial` controller wrapping intents (validate required action before forwarding to engine).  
- Coach component: title, ≤2 lines body, optional keyword pill (Guard / Rush).  
- Spotlight: existing accent tokens (ticker gold / terminal green) — pulsing ring on slot / portrait / button.  
- Mute toggle still works; soft coach SFX optional (reuse UI click / your-turn blip).  
- Mobile: coach card bottom sheet; doesn’t cover End Turn permanently (slide up, primary CTA visible).

## 8. Telemetry (lightweight, if easy)

If analytics already exist, else skip:

- `tutorial_started` / `tutorial_skipped` / `tutorial_completed`  
- `tutorial_beat_completed` with beat id  
- `tutorial_abandoned` with last beat  

No PII.

## 9. Acceptance criteria (Eng)

- [ ] First-time user is offered tutorial; skip persists.  
- [ ] Completed tutorial never auto-offers again.  
- [ ] No wallet prompts during tutorial.  
- [ ] Beats 1–6 each fire in a fresh run with fixed seed.  
- [ ] Illegal face attack while Guard up is blocked with coach feedback.  
- [ ] Summoning sickness explained before first legal attack.  
- [ ] Rush path lets player attack same turn at least once in the script.  
- [ ] Exit CTAs reach Vs AI and Main Menu.  
- [ ] Desktop 1280 + mobile ~390 width usable; no horizontal overflow on coach card.  
- [ ] Existing Vs AI / Online flows unchanged for users who skip/complete.

## 10. Defaults (no need to ask Josh)

- Starter faction: **Normies**  
- Opponent fantasy: **Doggos**  
- Secrets/Market Event: **out of tutorial** (tooltips in free play later)  
- Always skippable  

## 11. Eng handoff note

Implement as client-only feature flag `tutorial_v1`. Prefer scripted intent list + hand inject over forking engine rules. If script needs a tiny engine helper (`forceDraw`, `injectCard`), keep it behind `tutorial: true` match options so ranked/online never see it.
