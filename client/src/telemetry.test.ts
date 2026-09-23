import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_EVENT_NAMES,
  TelemetryEventName,
  __queueLengthForTests,
  __resetTelemetryForTests,
  anonId,
  flush,
  isTelemetryEventName,
  isValidAnonId,
  setTelemetryAuthToken,
  track,
} from "./telemetry.js";

/** Mirrors telemetry.ts — the queue depth that triggers an eager flush, and the hard bound. */
const BATCH_TRIGGER = 10;
const MAX_QUEUE = 100;

interface SentBatch {
  anonId: string;
  events: { name: string; ts: number; props?: Record<string, unknown> }[];
}

// jsdom's Blob content isn't synchronously readable, and these assertions are
// sync — so remember what went into each Blob on the way in.
const blobBodies = new WeakMap<Blob, string>();
const RealBlob = globalThis.Blob;
class RecordingBlob extends RealBlob {
  constructor(parts: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    blobBodies.set(this, String(parts[0]));
  }
}
globalThis.Blob = RecordingBlob as unknown as typeof Blob;

type TransportBehaviour = "ok" | "throw" | "reject";

let fetchCalls: { url: string; init: RequestInit }[] = [];
let beaconCalls: { url: string; body: string; type: string }[] = [];
let fetchBehaviour: TransportBehaviour;
let beaconResult: boolean | "throw";

function installFetch(): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    if (fetchBehaviour === "throw") throw new Error("network down");
    if (fetchBehaviour === "reject") return Promise.reject(new Error("404 — endpoint not deployed yet"));
    return Promise.resolve({ status: 202 } as Response);
  });
}

function installBeacon(): void {
  // jsdom ships no sendBeacon at all, so define it rather than spy on it.
  Object.defineProperty(navigator, "sendBeacon", {
    value: (url: string, blob: Blob) => {
      beaconCalls.push({ url, body: blobBodies.get(blob) ?? "", type: blob.type });
      if (beaconResult === "throw") throw new Error("beacon blocked");
      return beaconResult;
    },
    configurable: true,
    writable: true,
  });
}

function removeBeacon(): void {
  Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true, writable: true });
}

/** Everything the transport saw, whichever transport carried it. */
function sentBatches(): SentBatch[] {
  return [
    ...fetchCalls.map((call) => JSON.parse(call.init.body as string) as SentBatch),
    ...beaconCalls.map((call) => JSON.parse(call.body) as SentBatch),
  ];
}

function sentNames(): string[] {
  return sentBatches().flatMap((batch) => batch.events.map((e) => e.name));
}

beforeEach(() => {
  localStorage.clear();
  __resetTelemetryForTests();
  fetchCalls = [];
  beaconCalls = [];
  fetchBehaviour = "ok";
  beaconResult = true;
  installFetch();
  installBeacon();
});

afterEach(() => {
  __resetTelemetryForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("anonId", () => {
  it("creates an id matching the contract's [a-z0-9]{16,64} shape and persists it", () => {
    const id = anonId();
    expect(id).toMatch(/^[a-z0-9]{16,64}$/);
    expect(localStorage.getItem("cryptoclash.anonId")).toBe(id);
  });

  it("returns the same id on every call, and again after a simulated reload", () => {
    const first = anonId();
    expect(anonId()).toBe(first);

    // Module-level memory cleared, localStorage kept — i.e. a page reload.
    __resetTelemetryForTests();
    expect(anonId()).toBe(first);
  });

  it("ignores a stored value the server would reject rather than sending it", () => {
    localStorage.setItem("cryptoclash.anonId", "NOT-A-VALID-ID!!");
    const id = anonId();
    expect(id).toMatch(/^[a-z0-9]{16,64}$/);
    expect(id).not.toBe("NOT-A-VALID-ID!!");
  });

  it("falls back to a stable in-memory id when storage is unavailable (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    let id = "";
    expect(() => {
      id = anonId();
    }).not.toThrow();
    expect(id).toMatch(/^[a-z0-9]{16,64}$/);
    // Stable for the whole session even though nothing was ever written.
    expect(anonId()).toBe(id);
  });

  it("still sends events when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    track("app_open");
    flush();
    expect(sentBatches()[0].anonId).toMatch(/^[a-z0-9]{16,64}$/);
  });
});

describe("batching", () => {
  it("sends nothing synchronously on a single track()", () => {
    track("app_open");
    expect(fetchCalls).toHaveLength(0);
    expect(__queueLengthForTests()).toBe(1);
  });

  it("flushes on the timer", () => {
    vi.useFakeTimers();
    track("app_open");
    expect(fetchCalls).toHaveLength(0);

    vi.advanceTimersByTime(5000);
    expect(fetchCalls).toHaveLength(1);
    expect(sentNames()).toEqual(["app_open"]);
    expect(__queueLengthForTests()).toBe(0);
  });

  it("flushes immediately at the batch cap, without waiting for the timer", () => {
    vi.useFakeTimers();
    for (let i = 0; i < BATCH_TRIGGER; i += 1) track("landing_cta");
    expect(fetchCalls).toHaveLength(1);
    expect(sentNames()).toHaveLength(BATCH_TRIGGER);
    expect(__queueLengthForTests()).toBe(0);
  });

  it("POSTs the contract's envelope to /api/telemetry, with props and a client ts", () => {
    track("match_started", { mode: "online" });
    flush();

    expect(fetchCalls).toHaveLength(1);
    const { url, init } = fetchCalls[0];
    expect(url).toBe("http://localhost:8787/api/telemetry");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);

    const body = JSON.parse(init.body as string) as SentBatch;
    expect(body.anonId).toMatch(/^[a-z0-9]{16,64}$/);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe("match_started");
    expect(body.events[0].props).toEqual({ mode: "online" });
    expect(typeof body.events[0].ts).toBe("number");
  });

  it("sends the optional bearer token on the fetch transport", () => {
    setTelemetryAuthToken("session-token");
    track("wallet_connected");
    flush();
    expect((fetchCalls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
  });

  it("sends no Authorization header when there is no session", () => {
    track("app_open");
    flush();
    expect((fetchCalls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("flushing an empty queue is a no-op", () => {
    flush();
    expect(fetchCalls).toHaveLength(0);
    expect(beaconCalls).toHaveLength(0);
  });

  it("never sends a batch longer than the contract's 50-event cap", () => {
    // Fill past a single request's worth without letting the batch trigger fire.
    removeBeacon();
    vi.stubGlobal("fetch", undefined);
    for (let i = 0; i < 60; i += 1) track("app_open");
    expect(__queueLengthForTests()).toBe(60);

    installFetch();
    flush();
    expect(fetchCalls).toHaveLength(2);
    expect(JSON.parse(fetchCalls[0].init.body as string).events).toHaveLength(50);
    expect(JSON.parse(fetchCalls[1].init.body as string).events).toHaveLength(10);
  });
});

describe("page teardown", () => {
  it("uses sendBeacon for a hard flush, since a plain fetch dies with the page", () => {
    track("match_ended", { mode: "ai", result: "win", turns: 9 });
    flush(true);

    expect(beaconCalls).toHaveLength(1);
    expect(fetchCalls).toHaveLength(0);
    expect(beaconCalls[0].url).toBe("http://localhost:8787/api/telemetry");
    expect(beaconCalls[0].type).toBe("application/json");
    expect(sentNames()).toEqual(["match_ended"]);
  });

  it("hard-flushes on visibilitychange -> hidden, and on pagehide", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    track("app_open");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(beaconCalls).toHaveLength(1);

    track("landing_cta");
    window.dispatchEvent(new Event("pagehide"));
    expect(beaconCalls).toHaveLength(2);
    expect(sentNames()).toEqual(["app_open", "landing_cta"]);
  });

  it("does not flush on visibilitychange back to visible", () => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    track("app_open");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(beaconCalls).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it("falls back to keepalive fetch when sendBeacon is unavailable", () => {
    removeBeacon();
    track("app_open");
    flush(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].init.keepalive).toBe(true);
  });

  it("falls back to keepalive fetch when sendBeacon refuses the payload", () => {
    beaconResult = false;
    track("app_open");
    flush(true);
    expect(beaconCalls).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
  });
});

describe("the queue bound", () => {
  it("stops growing at the bound when there is no transport at all", () => {
    removeBeacon();
    vi.stubGlobal("fetch", undefined);

    for (let i = 0; i < MAX_QUEUE * 5; i += 1) track("app_open");

    expect(__queueLengthForTests()).toBe(MAX_QUEUE);
  });

  it("keeps the earliest events, dropping the overflow", () => {
    removeBeacon();
    vi.stubGlobal("fetch", undefined);

    track("app_open");
    for (let i = 0; i < MAX_QUEUE * 2; i += 1) track("screen_view", { screen: "menu" });

    installFetch();
    flush();
    expect(sentNames()[0]).toBe("app_open");
    expect(sentNames()).toHaveLength(MAX_QUEUE);
  });

  it("never re-queues a failed send — a dead endpoint doesn't retry forever", () => {
    fetchBehaviour = "throw";
    for (let i = 0; i < BATCH_TRIGGER; i += 1) track("app_open");

    expect(fetchCalls).toHaveLength(1);
    expect(__queueLengthForTests()).toBe(0);
  });
});

// Task A drops (does not correct) any event whose ts is non-finite or outside
// [2020-01-01, 2100-01-01) — an event with a bad ts would silently never land.
describe("the ts window the server enforces", () => {
  const TS_MIN = Date.UTC(2020, 0, 1);
  const TS_MAX = Date.UTC(2100, 0, 1);

  it("stamps every event with a real Date.now() inside the accepted window", () => {
    track("app_open");
    track("match_ended", { mode: "ai", result: "win", turns: 3 });
    flush();

    const events = sentBatches().flatMap((b) => b.events);
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(Number.isFinite(event.ts)).toBe(true);
      expect(event.ts).toBeGreaterThanOrEqual(TS_MIN);
      expect(event.ts).toBeLessThan(TS_MAX);
    }
  });

  it("drops an event locally rather than emitting one the server would bin (clock stuck in 1970)", () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    track("app_open");
    flush();
    expect(fetchCalls).toHaveLength(0);
    expect(__queueLengthForTests()).toBe(0);
  });

  it("drops an event whose clock is past the window (year 2200)", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2200, 0, 1));
    track("app_open");
    flush();
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("failing soft", () => {
  it("track() does not throw when the transport throws synchronously", () => {
    fetchBehaviour = "throw";
    removeBeacon();
    expect(() => {
      for (let i = 0; i < BATCH_TRIGGER; i += 1) track("app_open");
    }).not.toThrow();
  });

  it("track() does not throw when the transport rejects (a 404 from an endpoint that isn't deployed yet)", async () => {
    fetchBehaviour = "reject";
    expect(() => {
      track("app_open");
      flush();
    }).not.toThrow();
    // Let the rejection settle — it must not surface as an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
  });

  it("track() does not throw when sendBeacon throws", () => {
    beaconResult = "throw";
    track("app_open");
    expect(() => flush(true)).not.toThrow();
  });

  it("track() does not throw when Date.now() itself blows up", () => {
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("clock broken");
    });
    expect(() => track("app_open")).not.toThrow();
  });
});

describe("the allowlist", () => {
  it("matches the contract table exactly", () => {
    expect([...TELEMETRY_EVENT_NAMES]).toEqual([
      "app_open",
      "landing_cta",
      "tutorial_offered",
      "tutorial_started",
      "tutorial_completed",
      "tutorial_skipped",
      "wallet_connect_started",
      "wallet_connected",
      "deck_saved",
      "match_started",
      "match_ended",
      "queue_waited",
      "bot_fallback_shown",
      "pack_opened",
      "craft_action",
      "daily_claimed",
      "screen_view",
    ]);
  });

  it("isTelemetryEventName accepts the table and rejects everything else", () => {
    for (const name of TELEMETRY_EVENT_NAMES) expect(isTelemetryEventName(name)).toBe(true);
    expect(isTelemetryEventName("app_opened")).toBe(false);
    expect(isTelemetryEventName("")).toBe(false);
    expect(isTelemetryEventName("toString")).toBe(false);
  });

  it("isValidAnonId enforces the contract's 16-64 [a-z0-9] shape", () => {
    expect(isValidAnonId("a".repeat(16))).toBe(true);
    expect(isValidAnonId("a".repeat(64))).toBe(true);
    expect(isValidAnonId("a".repeat(15))).toBe(false);
    expect(isValidAnonId("a".repeat(65))).toBe(false);
    expect(isValidAnonId("ABCDEF0123456789")).toBe(false);
    expect(isValidAnonId("abcdef-0123456789")).toBe(false);
  });

  it("drops a name that isn't on the allowlist instead of sending it", () => {
    // Cast on purpose: the point is the runtime guard, which is what survives a
    // JS caller or a refactor that loses the type.
    track("totally_made_up" as TelemetryEventName);
    flush();

    expect(fetchCalls).toHaveLength(0);
    expect(beaconCalls).toHaveLength(0);
    expect(__queueLengthForTests()).toBe(0);
  });

  it("still sends the allowlisted events queued either side of a rejected one", () => {
    track("app_open");
    track("nope" as TelemetryEventName);
    track("landing_cta");
    flush();

    expect(sentNames()).toEqual(["app_open", "landing_cta"]);
  });
});

describe("prop sanitising (the server drops whole events that violate these)", () => {
  it("truncates strings longer than 64 chars", () => {
    track("screen_view", { screen: "x".repeat(200) });
    flush();
    expect((sentBatches()[0].events[0].props as { screen: string }).screen).toHaveLength(64);
  });

  it("drops non-scalar values rather than sending a nested object", () => {
    track("deck_saved", { faction: "Bulls", junk: { nested: true } } as unknown as Record<string, string>);
    flush();
    expect(sentBatches()[0].events[0].props).toEqual({ faction: "Bulls" });
  });

  it("caps props at 10 keys", () => {
    const props: Record<string, number> = {};
    for (let i = 0; i < 25; i += 1) props[`k${i}`] = i;
    track("pack_opened", props);
    flush();
    expect(Object.keys(sentBatches()[0].events[0].props ?? {})).toHaveLength(10);
  });

  it("omits props entirely for an event that has none", () => {
    track("daily_claimed");
    flush();
    expect(sentBatches()[0].events[0]).not.toHaveProperty("props");
  });
});
