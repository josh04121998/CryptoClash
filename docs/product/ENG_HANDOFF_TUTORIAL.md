# Eng handoff — tutorial_v1 + battle UI notes

**From:** TCG (product)  
**To:** TCG Eng  
**Date:** 2026-09-09  
**Priority:** Battle-first (Josh). Attract/retain via match quality before collect/on-chain.

## Build this

Implement **`tutorial_v1`** per:

`/workspace/cryptoclash-docs/TUTORIAL_SPEC.md`

Full acceptance criteria are in that file. Summary:

- Client-only, no wallet, always skippable, `localStorage` for completed/skipped
- Fixed Normies starter vs scripted Doggos coach bot
- Six blocking coach beats: Energy/play → summoning sickness → Rush/face → Guard → face open → loop reminder
- Reuse MatchView; tutorial controller validates required action before intents
- Exit → Practice vs AI or Main Menu
- Do **not** break existing Vs AI / Online

## Also file (do not block tutorial)

From live client walk on `https://crypto-clash-client-six.vercel.app/`:

1. **Online queue** — “Looking for an opponent…” with no timeout / leave / empty-queue copy when solo.
2. **Match chrome** — internal scrollbar can clip headers/controls; Match Log can intercept Menu until dismissed.
3. **Repro needed** — non-Rush creature attack sometimes didn’t visibly resolve (Pup Scout); confirm before fixing.
4. **IA gap (product, may be intentional)** — Arena menu hides Collection/Packs/Crafting until wallet; landing sells collect hard. Prefer a greyed “Connect wallet to collect” entry over invisible features — product call, not a drive-by.

## Out of scope this handoff

Skill MM, packs/economy, on-chain, art pipeline.

## Done when

Tutorial acceptance checklist in `TUTORIAL_SPEC.md` §9 is green on a preview deploy (or local), and Vs AI/Online smoke still work.
