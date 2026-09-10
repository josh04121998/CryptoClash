import { createMatch, injectCreature, MatchState } from "@cryptoclash/engine";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAttackAnimations } from "./useAttackAnimations.js";

const DECK = Array(30).fill("pup_scout");

function freshTutorialMatch(): MatchState {
  return createMatch(DECK, DECK, 1, { tutorial: true });
}

/**
 * Regression coverage for a 2026-09-10 fix, prompted by a live-client report that a non-Rush
 * creature's (Pup Scout) attack "sometimes didn't visibly resolve" — traced to `!== false` vs.
 * `=== false`: the old check missed a creature whose board slot never appeared in a *prior*
 * snapshot at all (e.g. Puppy Swarm summoning tokens and Pack Rush granting them Rush within the
 * same bot turn lets a brand-new creature attack before this hook ever recorded a `false`
 * baseline for its slot). The damage/log still resolved correctly — only the lunge animation
 * silently failed to fire, which is exactly what "didn't visibly resolve" describes.
 */
describe("useAttackAnimations — missing-key regression", () => {
  it("animates a creature that attacks the same tick it first appears on the board", () => {
    const state = freshTutorialMatch();
    const { result, rerender } = renderHook(({ s }: { s: MatchState }) => useAttackAnimations(s), {
      initialProps: { s: state },
    });

    // Prime the hook with an empty board first (a real prior snapshot to diff against).
    expect(result.current.size).toBe(0);

    // Summon and mark as already-attacked in one combined mutation, simulating a bot turn that
    // batches "summon + grant Rush + attack" before React ever re-renders in between.
    const slot = injectCreature(state, "B", "pup_scout", 0);
    state.players.B.board[slot]!.hasAttackedThisTurn = true;

    rerender({ s: state });

    expect(result.current.has(`B-${slot}`)).toBe(true);
  });

  it("does not animate anything on the very first snapshot, even if a creature is already flagged (reconnect/mount guard)", () => {
    const state = freshTutorialMatch();
    const slot = injectCreature(state, "B", "pup_scout", 0);
    state.players.B.board[slot]!.hasAttackedThisTurn = true;

    // The hook only ever sees this state for the first time here — same shape as a page
    // refresh mid-match handing back a MatchState where creatures already attacked earlier.
    const { result } = renderHook(() => useAttackAnimations(state));

    expect(result.current.size).toBe(0);
  });

  it("still correctly animates a normal false-to-true transition (the original, already-working case)", () => {
    const state = freshTutorialMatch();
    const slot = injectCreature(state, "B", "pup_scout", 0);

    const { result, rerender } = renderHook(({ s }: { s: MatchState }) => useAttackAnimations(s), {
      initialProps: { s: state },
    });
    expect(result.current.size).toBe(0);

    state.players.B.board[slot]!.hasAttackedThisTurn = true;
    state.log.push({ turn: state.turnNumber, text: "B attacks with Pup Scout." });
    rerender({ s: state });

    expect(result.current.has(`B-${slot}`)).toBe(true);
  });
});
