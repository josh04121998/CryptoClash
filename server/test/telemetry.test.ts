import { TELEMETRY_EVENT_NAMES, TELEMETRY_MAX_BATCH_SIZE } from "@cryptoclash/protocol";
import { Wallet } from "ethers";
import { Pool } from "pg";
import { SiweMessage } from "siwe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMatchServer, MatchServerHandle } from "../src/createMatchServer.js";
import { runMigrations } from "../src/migrate.js";
import { insertTelemetryEvents, validateTelemetryEvent } from "../src/telemetryRepo.js";

/**
 * Pure-validation tests — no database, so these run everywhere. The ingest path's whole job is
 * to not trust the client, and that logic is worth pinning down independently of Postgres.
 */
describe("telemetry event validation (no database)", () => {
  const ts = Date.UTC(2026, 8, 23, 12, 0, 0);

  it("accepts an allowlisted event with no props", () => {
    expect(validateTelemetryEvent({ name: "app_open", ts })).toEqual({ name: "app_open", ts });
  });

  it("accepts an allowlisted event with legal props", () => {
    expect(validateTelemetryEvent({ name: "match_ended", ts, props: { mode: "online", result: "win", turns: 12 } })).toEqual({
      name: "match_ended",
      ts,
      props: { mode: "online", result: "win", turns: 12 },
    });
  });

  it("drops an event whose name is not on the allowlist", () => {
    expect(validateTelemetryEvent({ name: "definitely_not_a_real_event", ts })).toBeNull();
    expect(validateTelemetryEvent({ name: "", ts })).toBeNull();
    expect(validateTelemetryEvent({ ts })).toBeNull();
  });

  it("drops an event with a missing or nonsensical ts rather than inventing one", () => {
    expect(validateTelemetryEvent({ name: "app_open" })).toBeNull();
    expect(validateTelemetryEvent({ name: "app_open", ts: "1758600000000" })).toBeNull();
    expect(validateTelemetryEvent({ name: "app_open", ts: Number.NaN })).toBeNull();
    expect(validateTelemetryEvent({ name: "app_open", ts: 0 })).toBeNull();
    expect(validateTelemetryEvent({ name: "app_open", ts: Date.UTC(2200, 0, 1) })).toBeNull();
  });

  it("drops an event whose props break the flat-primitives contract", () => {
    // Nested / array values.
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: { faction: { name: "Doggos" } } })).toBeNull();
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: { faction: ["Doggos"] } })).toBeNull();
    // null (which is also how a JSON NaN/Infinity arrives).
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: { faction: null } })).toBeNull();
    // props itself not an object.
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: "Doggos" })).toBeNull();
    // Over-long string value (65 chars).
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: { faction: "x".repeat(65) } })).toBeNull();
    // Over-long key.
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: { ["k".repeat(65)]: "Doggos" } })).toBeNull();
    // Too many keys (11).
    const wideProps = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    expect(validateTelemetryEvent({ name: "deck_saved", ts, props: wideProps })).toBeNull();
  });

  it("accepts exactly the cap: 10 keys, a 64-char string value", () => {
    const props = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, i]));
    expect(validateTelemetryEvent({ name: "screen_view", ts, props })).not.toBeNull();
    expect(validateTelemetryEvent({ name: "screen_view", ts, props: { screen: "x".repeat(64) } })).not.toBeNull();
  });

  it("drops non-object entries outright", () => {
    expect(validateTelemetryEvent(null)).toBeNull();
    expect(validateTelemetryEvent("app_open")).toBeNull();
    expect(validateTelemetryEvent(["app_open"])).toBeNull();
  });
});

// These hit a real Postgres — set DATABASE_URL (see server/README.md) to run them.
// They no-op (describe.skip) rather than fail when it's unset, exactly like db.test.ts/api.test.ts.
const databaseUrl = process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d("POST /api/telemetry over real HTTP, against real Postgres", () => {
  let server: MatchServerHandle;
  let baseUrl: string;
  let pool: Pool;

  /** 32 chars of [a-z0-9] — the shape a stripped crypto.randomUUID() produces client-side. */
  const anonId = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  /** A minute ago on the "client" clock, so the server's own created_at is always strictly later. */
  const ts = Date.now() - 60_000;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
    process.env.SIWE_DOMAIN = "cryptoclash.test";
    pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
    await runMigrations(pool);
    server = await createMatchServer(0);
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
    await pool.end();
  });

  afterEach(async () => {
    // analytics_events first: account_id is `on delete set null`, not cascade, so deleting
    // accounts deliberately leaves these rows behind (see 0013_analytics_events.sql).
    await pool.query("delete from analytics_events");
    await pool.query("delete from accounts");
  });

  async function post(body: unknown, token?: string): Promise<Response> {
    return fetch(`${baseUrl}/api/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function storedEvents(): Promise<
    { name: string; anon_id: string; account_id: string | null; props: Record<string, unknown>; client_ts: Date; created_at: Date }[]
  > {
    const result = await pool.query("select * from analytics_events order by client_ts, name");
    return result.rows;
  }

  /** Same SIWE dance api.test.ts does, minus the starting-faction pick (irrelevant here). */
  async function signIn(): Promise<{ token: string; accountId: string }> {
    const wallet = Wallet.createRandom();
    const nonceRes = await fetch(`${baseUrl}/api/auth/nonce`);
    const { nonce } = (await nonceRes.json()) as { nonce: string };
    const message = new SiweMessage({
      domain: "cryptoclash.test",
      address: wallet.address,
      statement: "Sign in to FLOORWARS.",
      uri: "https://cryptoclash.test",
      version: "1",
      chainId: 1,
      nonce,
    }).prepareMessage();
    const signature = await wallet.signMessage(message);
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(verifyRes.status).toBe(200);
    const body = (await verifyRes.json()) as { token: string; account: { id: string } };
    return { token: body.token, accountId: body.account.id };
  }

  it("accepts a good anonymous batch and stores every event", async () => {
    const res = await post({
      anonId,
      events: [
        { name: "app_open", ts },
        { name: "match_started", ts: ts + 1000, props: { mode: "online" } },
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2 });

    const rows = await storedEvents();
    expect(rows.map((r) => r.name)).toEqual(["app_open", "match_started"]);
    expect(rows[0].anon_id).toBe(anonId);
    expect(rows[0].account_id).toBeNull();
    expect(rows[0].props).toEqual({});
    expect(rows[0].client_ts.getTime()).toBe(ts);
    // The server stamps its own receipt time regardless of the client clock.
    expect(rows[0].created_at.getTime()).toBeGreaterThan(ts);
    expect(rows[1].props).toEqual({ mode: "online" });
  });

  it("rejects a batch longer than the cap without storing any of it", async () => {
    const events = Array.from({ length: TELEMETRY_MAX_BATCH_SIZE + 1 }, (_, i) => ({ name: "app_open", ts: ts + i }));
    const res = await post({ anonId, events });
    expect(res.status).toBe(400);
    expect(await storedEvents()).toHaveLength(0);
  });

  it("accepts a batch exactly at the cap", async () => {
    const events = Array.from({ length: TELEMETRY_MAX_BATCH_SIZE }, (_, i) => ({ name: "app_open", ts: ts + i }));
    const res = await post({ anonId, events });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: TELEMETRY_MAX_BATCH_SIZE });
    expect(await storedEvents()).toHaveLength(TELEMETRY_MAX_BATCH_SIZE);
  });

  it("rejects an empty events array and a missing one", async () => {
    expect((await post({ anonId, events: [] })).status).toBe(400);
    expect((await post({ anonId })).status).toBe(400);
    expect((await post({ anonId, events: "app_open" })).status).toBe(400);
    expect(await storedEvents()).toHaveLength(0);
  });

  it("rejects a malformed anon_id", async () => {
    const good = [{ name: "app_open", ts }];
    expect((await post({ events: good })).status).toBe(400); // missing
    expect((await post({ anonId: "short", events: good })).status).toBe(400); // < 16 chars
    expect((await post({ anonId: "A1B2C3D4E5F60718293A4B5C6D7E8F90", events: good })).status).toBe(400); // uppercase
    expect((await post({ anonId: "a1b2-c3d4-e5f6-0718-293a-4b5c6d7e", events: good })).status).toBe(400); // dashes
    expect((await post({ anonId: "a".repeat(65), events: good })).status).toBe(400); // > 64 chars
    expect((await post({ anonId: 12345678901234567890, events: good })).status).toBe(400); // not a string
    expect(await storedEvents()).toHaveLength(0);
  });

  it("drops a non-allowlisted event silently while the rest of the batch survives", async () => {
    const res = await post({
      anonId,
      events: [
        { name: "app_open", ts },
        { name: "admin_grant_coins", ts: ts + 1, props: { amount: 99999 } },
        { name: "match_started", ts: ts + 2, props: { mode: "ai" } },
      ],
    });
    // 202 and no hint of which name was rejected — the allowlist must not be enumerable.
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ accepted: 2 });
    expect(JSON.stringify(body)).not.toContain("admin_grant_coins");

    const rows = await storedEvents();
    expect(rows.map((r) => r.name)).toEqual(["app_open", "match_started"]);
  });

  it("drops only the events with illegal props, keeping the rest", async () => {
    const res = await post({
      anonId,
      events: [
        { name: "deck_saved", ts, props: { faction: "Doggos" } },
        { name: "pack_opened", ts: ts + 1, props: { packType: { nested: true } } },
        { name: "screen_view", ts: ts + 2, props: { screen: "x".repeat(65) } },
        { name: "craft_action", ts: ts + 3, props: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i])) },
        { name: "daily_claimed", ts: ts + 4 },
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2 });
    const rows = await storedEvents();
    expect(rows.map((r) => r.name)).toEqual(["deck_saved", "daily_claimed"]);
    expect(rows[0].props).toEqual({ faction: "Doggos" });
  });

  it("returns 202 with accepted:0 when every event in a well-formed envelope is dropped", async () => {
    const res = await post({ anonId, events: [{ name: "nope", ts }] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 0 });
    expect(await storedEvents()).toHaveLength(0);
  });

  it("attributes to the account when a valid bearer token is present, and stays anonymous otherwise", async () => {
    const { token, accountId } = await signIn();

    const authed = await post({ anonId, events: [{ name: "wallet_connected", ts }] }, token);
    expect(authed.status).toBe(202);

    const anonymous = await post({ anonId, events: [{ name: "app_open", ts: ts + 1 }] });
    expect(anonymous.status).toBe(202);

    // An invalid/garbage token is soft — anonymous attribution, not a 401 (same posture as
    // the /api/leaderboard/* routes).
    const badToken = await post({ anonId, events: [{ name: "landing_cta", ts: ts + 2 }] }, "not-a-real-jwt");
    expect(badToken.status).toBe(202);

    const rows = await storedEvents();
    expect(rows.map((r) => [r.name, r.account_id])).toEqual([
      ["wallet_connected", accountId],
      ["app_open", null],
      ["landing_cta", null],
    ]);
  });

  it("keeps the anon_id joinable across the pre- and post-wallet halves of the funnel", async () => {
    const { token, accountId } = await signIn();
    await post({ anonId, events: [{ name: "landing_cta", ts }] });
    await post({ anonId, events: [{ name: "wallet_connected", ts: ts + 1 }] }, token);

    const joined = await pool.query<{ anon_id: string; accounts: string }>(
      `select anon_id, count(distinct account_id) as accounts from analytics_events where anon_id = $1 group by anon_id`,
      [anonId],
    );
    expect(joined.rows).toHaveLength(1);
    expect(Number(joined.rows[0].accounts)).toBe(1);
    const linked = await pool.query<{ account_id: string | null }>(
      "select distinct account_id from analytics_events where anon_id = $1 and account_id is not null",
      [anonId],
    );
    expect(linked.rows[0].account_id).toBe(accountId);
  });

  it("does not disturb the unrelated market-events routes", async () => {
    // /api/events/active is a completely different feature that happens to share the word
    // "events" — this is a guard against the telemetry route ever shadowing it.
    const res = await fetch(`${baseUrl}/api/events/active`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ event: null });
    expect((await fetch(`${baseUrl}/api/telemetry`)).status).toBe(404); // GET isn't a telemetry route
  });

  it("writes a multi-row batch in one insert via the repo", async () => {
    const written = await insertTelemetryEvents(pool, {
      anonId,
      accountId: null,
      events: [
        { name: "queue_waited", ts, props: { seconds: 7 } },
        { name: "bot_fallback_shown", ts: ts + 1 },
        { name: "match_started", ts: ts + 2, props: { mode: "bot_fallback" } },
      ],
    });
    expect(written).toBe(3);
    const rows = await storedEvents();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.props)).toContainEqual({ seconds: 7 });
  });

  it("stores every name on the allowlist", async () => {
    // A cheap guard that the allowlist and the column type stay compatible (e.g. nobody adds a
    // name the table or the validator would choke on).
    const events = TELEMETRY_EVENT_NAMES.map((name, i) => ({ name, ts: ts + i }));
    expect(events.length).toBeLessThanOrEqual(TELEMETRY_MAX_BATCH_SIZE);
    const res = await post({ anonId, events });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: TELEMETRY_EVENT_NAMES.length });
  });
});
