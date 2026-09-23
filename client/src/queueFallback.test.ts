import { describe, expect, it } from "vitest";
import { BOT_FALLBACK_SECONDS, QUEUE_HINT_SECONDS, shouldFallBackToBot, shouldShowQueueHint } from "./queueFallback.js";

const queued = (queuedSeconds: number, waitingByChoice = false) => ({ status: "queued", queuedSeconds, waitingByChoice });

describe("shouldFallBackToBot", () => {
  it("waits out the full window before giving up", () => {
    expect(shouldFallBackToBot(queued(0))).toBe(false);
    expect(shouldFallBackToBot(queued(BOT_FALLBACK_SECONDS - 1))).toBe(false);
    expect(shouldFallBackToBot(queued(BOT_FALLBACK_SECONDS))).toBe(true);
    expect(shouldFallBackToBot(queued(BOT_FALLBACK_SECONDS + 30))).toBe(true);
  });

  it("only ever fires from the queue", () => {
    // A long-running match must never be yanked out from under the player by a
    // stale queuedSeconds value, so every non-queued status is inert.
    for (const status of ["connecting", "in-match", "reconnecting", "opponent-left", "error"]) {
      expect(shouldFallBackToBot({ status, queuedSeconds: 999, waitingByChoice: false })).toBe(false);
    }
  });

  it("respects an explicit choice to wait for a real opponent", () => {
    // The whole point of "Wait for a real opponent" is not to be overridden
    // 20 seconds later by the same automatic fallback they just backed out of.
    expect(shouldFallBackToBot(queued(BOT_FALLBACK_SECONDS, true))).toBe(false);
    expect(shouldFallBackToBot(queued(BOT_FALLBACK_SECONDS * 10, true))).toBe(false);
  });
});

describe("shouldShowQueueHint", () => {
  it("warns before the fallback actually happens", () => {
    expect(QUEUE_HINT_SECONDS).toBeLessThan(BOT_FALLBACK_SECONDS);
    expect(shouldShowQueueHint(queued(QUEUE_HINT_SECONDS - 1))).toBe(false);
    expect(shouldShowQueueHint(queued(QUEUE_HINT_SECONDS))).toBe(true);
  });

  it("holds the hint back until the normal window when the player chose to wait", () => {
    // They already know nobody's queued — that's why they chose to wait — so
    // re-warning at 12s is noise. Say something only once the usual wait lapses.
    expect(shouldShowQueueHint(queued(QUEUE_HINT_SECONDS, true))).toBe(false);
    expect(shouldShowQueueHint(queued(BOT_FALLBACK_SECONDS, true))).toBe(true);
  });

  it("shows nothing outside the queue", () => {
    expect(shouldShowQueueHint({ status: "in-match", queuedSeconds: 999, waitingByChoice: false })).toBe(false);
  });
});
