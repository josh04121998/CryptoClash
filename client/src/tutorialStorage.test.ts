import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTutorialCompleted,
  isTutorialSkipped,
  markTutorialCompleted,
  markTutorialSkipped,
  shouldOfferTutorial,
} from "./tutorialStorage.js";

beforeEach(() => {
  localStorage.clear();
});

describe("fresh state (nothing in storage yet)", () => {
  it("reports not completed, not skipped, and offers the tutorial", () => {
    expect(isTutorialCompleted()).toBe(false);
    expect(isTutorialSkipped()).toBe(false);
    expect(shouldOfferTutorial()).toBe(true);
  });
});

describe("markTutorialCompleted", () => {
  it("flags completed and stops offering the tutorial", () => {
    markTutorialCompleted();
    expect(isTutorialCompleted()).toBe(true);
    expect(shouldOfferTutorial()).toBe(false);
  });

  it("clears a prior skip flag (completing supersedes skipping)", () => {
    markTutorialSkipped();
    expect(isTutorialSkipped()).toBe(true);

    markTutorialCompleted();
    expect(isTutorialSkipped()).toBe(false);
    expect(isTutorialCompleted()).toBe(true);
  });
});

describe("markTutorialSkipped", () => {
  it("flags skipped and stops offering the tutorial, without marking it completed", () => {
    markTutorialSkipped();
    expect(isTutorialSkipped()).toBe(true);
    expect(isTutorialCompleted()).toBe(false);
    expect(shouldOfferTutorial()).toBe(false);
  });
});

describe("fail-soft behavior when storage throws (private browsing / blocked storage)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("read functions swallow a throwing getItem and report false instead of throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => isTutorialCompleted()).not.toThrow();
    expect(isTutorialCompleted()).toBe(false);
    expect(() => isTutorialSkipped()).not.toThrow();
    expect(isTutorialSkipped()).toBe(false);
    // shouldOfferTutorial reads storage twice internally — still shouldn't throw.
    expect(() => shouldOfferTutorial()).not.toThrow();
  });

  it("write functions swallow a throwing setItem/removeItem instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => markTutorialCompleted()).not.toThrow();
    expect(() => markTutorialSkipped()).not.toThrow();
  });
});
