import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TUTORIAL_RUSH_CARD } from "./decks.js";
import { useTutorialMatch } from "./useTutorialMatch.js";

/**
 * Regression coverage for a 2026-09-10 fix: `ensureRushInHand` (the effect that
 * injects TUTORIAL_RUSH_CARD into A's hand once it's A's turn >= 2 and the card
 * hasn't shown up naturally) used to have no return value, so its effect never
 * called `bump()` after injecting — the card landed in the mutable match state
 * but nothing forced a re-render, so the UI didn't reliably pick it up. The fix
 * has `ensureRushInHand` report whether it injected, and the effect calls
 * `bump()` when it did.
 *
 * These tests drive the hook without playing out the full scripted deck: the
 * pre-match ack is real, but the actual card-play/attack intents that would
 * normally advance a live match are skipped in favor of directly steering the
 * mutable MatchState the hook already exposes as `state` (the same object
 * `stateRef.current` points at), then using an intent gateIntent is guaranteed
 * to *reject* (so `dispatch` bumps `version` once without also running the
 * real `applyIntent` path and disturbing turnNumber/activePlayer again).
 */
describe("useTutorialMatch — ensureRushInHand re-render fix", () => {
  it("injects the Rush card on turn 2 and bumps version again so the change is visible", () => {
    const { result } = renderHook(() => useTutorialMatch());

    act(() => {
      result.current.ackPreMatch();
    });

    // Simulate "it's A's turn 2 and the scripted Rush card hasn't shown up yet"
    // without actually playing the match out.
    const state = result.current.state;
    expect(state.players.A.hand).not.toContain(TUTORIAL_RUSH_CARD);
    state.turnNumber = 2;
    state.activePlayer = "A";

    const versionBefore = result.current.version;

    // At beat 1 with preMatchAck true, an endTurn intent is rejected by
    // gateIntent (case 1 requires a playCard intent) *before* applyIntent
    // ever runs — so this bumps version without touching turnNumber/activePlayer.
    act(() => {
      result.current.dispatch({ kind: "endTurn", playerId: "A" });
    });

    // One bump from the rejected dispatch, plus one more from ensureRushInHand's
    // effect firing after it injected the card — that second bump is exactly
    // what the fix added.
    expect(result.current.version).toBe(versionBefore + 2);
    expect(result.current.state.players.A.hand).toContain(TUTORIAL_RUSH_CARD);
  });

  it("does not keep re-bumping once the Rush card is already in hand", () => {
    const { result } = renderHook(() => useTutorialMatch());

    act(() => {
      result.current.ackPreMatch();
    });

    const state = result.current.state;
    state.turnNumber = 2;
    state.activePlayer = "A";

    act(() => {
      result.current.dispatch({ kind: "endTurn", playerId: "A" }); // first injection, +2
    });
    expect(result.current.state.players.A.hand).toContain(TUTORIAL_RUSH_CARD);

    const versionBefore = result.current.version;
    act(() => {
      result.current.dispatch({ kind: "endTurn", playerId: "A" }); // card already present this time
    });

    // Only the dispatch's own bump — ensureRushInHand found the card already
    // there and reported no injection, so no extra bump.
    expect(result.current.version).toBe(versionBefore + 1);
  });
});
