import { apiUrl } from "./api.js";

/**
 * Client telemetry SDK (session 33 telemetry contract).
 *
 * Hard rule from the contract: telemetry must never break the game. Every
 * public function here is total — it swallows everything, never awaits on a
 * user action, and never throws into React. A dead endpoint (or one that
 * doesn't exist yet, which is the case until the server branch merges) costs
 * one silently-failed fetch per batch and nothing else.
 */

const ANON_ID_KEY = "cryptoclash.anonId";
const ENDPOINT_PATH = "/api/telemetry";

/**
 * TODO(merge): replace this whole block — TELEMETRY_EVENT_NAMES,
 * TelemetryEventName, isTelemetryEventName, isValidAnonId,
 * TELEMETRY_MAX_BATCH_SIZE — with the shared definitions task A landed:
 *
 *   import {
 *     TELEMETRY_EVENT_NAMES,
 *     isTelemetryEventName,
 *     isValidAnonId,
 *     TELEMETRY_MAX_BATCH_SIZE,
 *   } from "@cryptoclash/protocol";
 *
 * (package root, not a subpath — that package has no `exports` map). They do
 * not exist in this worktree yet, so typecheck would fail on that import today.
 * The names and values below are deliberately identical to the contract's
 * table so the swap is a delete-and-import with no other change.
 *
 * The server has the authoritative copy and is the real gate (never trust the
 * client); this local copy exists so a typo in a call site is a TypeScript
 * error rather than an event that silently vanishes server-side.
 */
export const TELEMETRY_EVENT_NAMES = [
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
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

const ALLOWED_NAMES: ReadonlySet<string> = new Set(TELEMETRY_EVENT_NAMES);

export function isTelemetryEventName(name: string): name is TelemetryEventName {
  return ALLOWED_NAMES.has(name);
}

const ANON_ID_PATTERN = /^[a-z0-9]{16,64}$/;

export function isValidAnonId(value: string): boolean {
  return ANON_ID_PATTERN.test(value);
}

/** Contract: batches longer than this are a 400. Never send more than this in one request. */
export const TELEMETRY_MAX_BATCH_SIZE = 50;

/** Contract: flat object, <= 10 keys, string/number/boolean values, strings <= 64 chars. */
export type TelemetryProps = Record<string, string | number | boolean>;

interface QueuedEvent {
  name: string;
  ts: number;
  props?: TelemetryProps;
}

/** Queue length that triggers an immediate flush rather than waiting for the timer. */
const BATCH_TRIGGER = 10;
/**
 * Hard bound on the queue. A dead endpoint must not be able to grow memory
 * without limit, and there is no retry anywhere in this file — a failed send
 * drops its events on the floor rather than re-queueing them.
 */
const MAX_QUEUE = 100;
const FLUSH_INTERVAL_MS = 5000;
/** Contract: props values that are strings are capped at 64 chars; longer ones would get the event dropped server-side. */
const MAX_PROP_STRING = 64;
const MAX_PROP_KEYS = 10;

/**
 * The server drops (does not correct) any event whose `ts` falls outside
 * [2020-01-01, 2100-01-01) or isn't a finite number — a machine with a wildly
 * wrong clock would otherwise produce events that silently never land. We
 * check the same window here so a bad clock costs us the event locally and
 * visibly rather than server-side and invisibly.
 */
const TS_MIN = Date.UTC(2020, 0, 1);
const TS_MAX = Date.UTC(2100, 0, 1);

function isValidTs(ts: number): boolean {
  return Number.isFinite(ts) && ts >= TS_MIN && ts < TS_MAX;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let memoryAnonId: string | null = null;
let authToken: string | null = null;

function randomId(): string {
  try {
    // Contract: crypto.randomUUID() with the dashes stripped -> 32 chars of [a-f0-9].
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    // No crypto (very old browser, or a locked-down context) — still has to
    // produce something matching the contract's [a-z0-9]{16,64}.
    let out = "";
    while (out.length < 32) out += Math.random().toString(36).slice(2);
    return out.slice(0, 32);
  }
}

/**
 * Stable per-device/browser id. A device bucket, not a person — it is what
 * makes the pre-wallet funnel joinable to the post-wallet funnel.
 *
 * Fails soft exactly like tutorialStorage.ts: if localStorage throws (private
 * mode, blocked storage), we keep an in-memory id for the session instead and
 * carry on rather than losing every event.
 */
export function anonId(): string {
  try {
    const stored = localStorage.getItem(ANON_ID_KEY);
    if (stored && isValidAnonId(stored)) return stored;
  } catch {
    /* private mode / blocked storage — fall through to the in-memory id */
  }
  if (!memoryAnonId) memoryAnonId = randomId();
  try {
    localStorage.setItem(ANON_ID_KEY, memoryAnonId);
  } catch {
    /* same — the id just won't survive a reload */
  }
  return memoryAnonId;
}

/**
 * The contract makes `Authorization` optional: when a valid bearer token is
 * present the server resolves `account_id` itself (the client never sends it).
 * Only the fetch transport can carry a header — `sendBeacon` cannot, so
 * unload batches are always anonymous and joined by `anonId` alone.
 */
export function setTelemetryAuthToken(token: string | null): void {
  authToken = token;
}

function sanitizeProps(props: TelemetryProps): TelemetryProps | undefined {
  const out: TelemetryProps = {};
  let keys = 0;
  for (const [key, value] of Object.entries(props)) {
    if (keys >= MAX_PROP_KEYS) break;
    if (typeof value === "string") out[key] = value.slice(0, MAX_PROP_STRING);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else continue;
    keys += 1;
  }
  return keys > 0 ? out : undefined;
}

/**
 * Queue one event. Synchronous, non-blocking, never throws, never awaited.
 * A name outside the allowlist is dropped here (the server drops it too —
 * this just saves the round trip).
 */
export function track(name: TelemetryEventName, props?: TelemetryProps): void {
  try {
    if (!isTelemetryEventName(name)) return;
    // Bounded: once full we drop new events rather than evicting old ones, so a
    // dead endpoint costs a fixed amount of memory and the earliest (most
    // funnel-relevant) events are the ones that survive.
    if (queue.length >= MAX_QUEUE) return;
    const ts = Date.now();
    if (!isValidTs(ts)) return;
    const clean = props ? sanitizeProps(props) : undefined;
    queue.push(clean ? { name, ts, props: clean } : { name, ts });
    if (queue.length >= BATCH_TRIGGER) flush();
    else scheduleFlush();
  } catch {
    /* telemetry must never break the game */
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  } catch {
    flushTimer = null;
  }
}

function clearFlushTimer(): void {
  if (flushTimer === null) return;
  try {
    clearTimeout(flushTimer);
  } catch {
    /* ignore */
  }
  flushTimer = null;
}

function sendViaFetch(url: string, body: string): void {
  // `keepalive` lets an in-flight request outlive the page in browsers without
  // sendBeacon. Never awaited; the rejection is swallowed so a dead endpoint
  // can't surface as an unhandled rejection in the console.
  void fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body,
    keepalive: true,
  }).catch(() => {});
}

function sendViaBeacon(url: string, body: string): boolean {
  const send = typeof navigator !== "undefined" ? navigator.sendBeacon : undefined;
  if (typeof send !== "function") return false;
  // A Blob (rather than a bare string) is what gets the request an
  // application/json content-type instead of text/plain.
  return send.call(navigator, url, new Blob([body], { type: "application/json" })) === true;
}

/**
 * Whether there is any way to send at all. A missing transport (an old browser,
 * a non-DOM harness) is the one case where events stay queued instead of being
 * handed off — which is exactly what MAX_QUEUE bounds. Note this is *not* a
 * retry-on-failure check: a transport that exists and 404s still drains.
 */
function hasTransport(): boolean {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") return true;
    return typeof fetch === "function";
  } catch {
    return false;
  }
}

function send(events: QueuedEvent[], useBeacon: boolean): void {
  // apiUrl() — not hand-rolled joining. It carries the session-1 production
  // trailing-slash fix (see api.test.ts); re-deriving the base URL here would
  // reintroduce that bug.
  const url = `${apiUrl()}${ENDPOINT_PATH}`;
  const body = JSON.stringify({ anonId: anonId(), events });
  if (useBeacon && sendViaBeacon(url, body)) return;
  sendViaFetch(url, body);
}

/**
 * Ship whatever is queued. `beacon` is for page teardown — a normal fetch is
 * killed when the page goes away, which would silently lose exactly the events
 * right before someone leaves (the interesting ones).
 */
export function flush(beacon = false): void {
  try {
    clearFlushTimer();
    if (queue.length === 0) return;
    if (!hasTransport()) return;
    const pending = queue;
    queue = [];
    for (let i = 0; i < pending.length; i += TELEMETRY_MAX_BATCH_SIZE) {
      send(pending.slice(i, i + TELEMETRY_MAX_BATCH_SIZE), beacon);
    }
  } catch {
    /* dropped silently — never retried, never rethrown */
  }
}

function hardFlush(): void {
  flush(true);
}

// Registered once at module load. `visibilitychange` -> hidden is the reliable
// signal on mobile (a backgrounded tab is often never given a pagehide);
// `pagehide` covers desktop navigation and bfcache entry.
try {
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hardFlush();
    });
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", hardFlush);
  }
} catch {
  /* no DOM (SSR/test harness) — timer flushes still work */
}

/** Test-only: clears every piece of module-level state so specs don't leak into each other. */
export function __resetTelemetryForTests(): void {
  clearFlushTimer();
  queue = [];
  memoryAnonId = null;
  authToken = null;
}

/** Test-only: the current queue depth, for asserting the bound. */
export function __queueLengthForTests(): number {
  return queue.length;
}
