import { Wallet } from "ethers";
import { Pool } from "pg";
import { SiweMessage } from "siwe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMatchServer, MatchServerHandle } from "../src/createMatchServer.js";
import { runMigrations } from "../src/migrate.js";
import { WELCOME_BONUS_COINS } from "../src/coinsRepo.js";
import { PACK_DEFINITIONS } from "../src/packsRepo.js";

const databaseUrl = process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d("/api/* over real HTTP, against real Postgres", () => {
  let server: MatchServerHandle;
  let baseUrl: string;
  let pool: Pool;

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
    await pool.query("delete from decks");
    await pool.query("delete from accounts"); // cascades to card_instances
  });

  async function signIn(): Promise<{ token: string; address: string }> {
    const wallet = Wallet.createRandom();
    const nonceRes = await fetch(`${baseUrl}/api/auth/nonce`);
    const { nonce } = (await nonceRes.json()) as { nonce: string };

    const siwe = new SiweMessage({
      domain: "cryptoclash.test",
      address: wallet.address,
      statement: "Sign in to CRYPTO CLASH.",
      uri: "https://cryptoclash.test",
      version: "1",
      chainId: 1,
      nonce,
    });
    const message = siwe.prepareMessage();
    const signature = await wallet.signMessage(message);

    const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(verifyRes.status).toBe(200);
    const body = (await verifyRes.json()) as { token: string; account: { walletAddress: string } };
    return { token: body.token, address: body.account.walletAddress };
  }

  it("completes a full sign-in and gets a usable session token", async () => {
    const { token, address } = await signIn();
    expect(token).toBeTruthy();
    expect(address).toMatch(/^0x/);
  });

  it("rejects /api/decks with no Authorization header", async () => {
    const res = await fetch(`${baseUrl}/api/decks`);
    expect(res.status).toBe(401);
  });

  it("creates, lists, and deletes a deck through the real HTTP API", async () => {
    const { token } = await signIn();
    const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

    const thirtyPupScouts = Array(30).fill("pup_scout");
    const createRes = await fetch(`${baseUrl}/api/decks`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "Test Deck", cards: thirtyPupScouts }),
    });
    // MAX_COPIES_PER_CARD is 3 — 30 copies of one card should be rejected as illegal, not silently saved.
    expect(createRes.status).toBe(422);

    // All Common-rarity — the starting collection (post-packs) only grants Commons, so
    // any test exercising deck save/ownership together needs a deck buildable from those.
    const legalDeck = [
      ...Array(3).fill("pup_scout"),
      ...Array(3).fill("fast_fang"),
      ...Array(3).fill("shadow_pup"),
      ...Array(3).fill("pump_signal"),
      ...Array(3).fill("cool_down"),
      ...Array(3).fill("leap_frog"),
      ...Array(3).fill("warty_lookout"),
      ...Array(3).fill("sticky_tongue"),
      ...Array(3).fill("chaos_croak"),
      ...Array(3).fill("junior_dev"),
    ];
    const goodCreateRes = await fetch(`${baseUrl}/api/decks`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "Test Deck", cards: legalDeck }),
    });
    expect(goodCreateRes.status).toBe(201);
    const { deck } = (await goodCreateRes.json()) as { deck: { id: string } };

    const listRes = await fetch(`${baseUrl}/api/decks`, { headers: auth });
    const { decks } = (await listRes.json()) as { decks: { id: string }[] };
    expect(decks.map((d) => d.id)).toEqual([deck.id]);

    const deleteRes = await fetch(`${baseUrl}/api/decks/${deck.id}`, { method: "DELETE", headers: auth });
    expect(deleteRes.status).toBe(204);

    const listAfterDeleteRes = await fetch(`${baseUrl}/api/decks`, { headers: auth });
    expect(((await listAfterDeleteRes.json()) as { decks: unknown[] }).decks).toEqual([]);
  });

  it("grants a starting collection on sign-in, readable via /api/collection", async () => {
    const { token } = await signIn();
    const res = await fetch(`${baseUrl}/api/collection`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const { owned, foils } = (await res.json()) as { owned: Record<string, number>; foils: Record<string, number> };
    expect(owned["pup_scout"]).toBe(3); // Common
    expect(owned["moon_dog"]).toBeUndefined(); // Rare — pack-only now
    expect(owned["puppy"]).toBeUndefined(); // token, never granted
    expect(foils).toEqual({}); // starting collection is never foil — only packs roll foils
  });

  it("rejects a deck that needs more copies than the account owns", async () => {
    const { token, address } = await signIn();
    const account = await pool.query<{ id: string }>("select id from accounts where wallet_address = $1", [address]);
    const accountId = account.rows[0].id;

    // Sell off two of this account's three owned Pup Scouts, as duplicate-protection/crafting
    // will eventually let a player do (spec.md Section 18) — leaves only 1 owned.
    const instances = await pool.query<{ id: string }>(
      `select ci.id from card_instances ci
       join card_editions ce on ce.id = ci.edition_id
       where ci.owner_id = $1 and ce.template_id = 'pup_scout' limit 2`,
      [accountId],
    );
    await pool.query("delete from card_instances where id = any($1::uuid[])", [instances.rows.map((r) => r.id)]);

    // All Common-rarity — the starting collection (post-packs) only grants Commons, so
    // any test exercising deck save/ownership together needs a deck buildable from those.
    const legalDeck = [
      ...Array(3).fill("pup_scout"),
      ...Array(3).fill("fast_fang"),
      ...Array(3).fill("shadow_pup"),
      ...Array(3).fill("pump_signal"),
      ...Array(3).fill("cool_down"),
      ...Array(3).fill("leap_frog"),
      ...Array(3).fill("warty_lookout"),
      ...Array(3).fill("sticky_tongue"),
      ...Array(3).fill("chaos_croak"),
      ...Array(3).fill("junior_dev"),
    ];
    const res = await fetch(`${baseUrl}/api/decks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Deck", cards: legalDeck }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { details: string[] };
    expect(body.details.some((d) => d.includes("Pup Scout"))).toBe(true);
  });

  it("won't let one account's token touch another account's deck", async () => {
    const owner = await signIn();
    const intruder = await signIn();
    // All Common-rarity — the starting collection (post-packs) only grants Commons, so
    // any test exercising deck save/ownership together needs a deck buildable from those.
    const legalDeck = [
      ...Array(3).fill("pup_scout"),
      ...Array(3).fill("fast_fang"),
      ...Array(3).fill("shadow_pup"),
      ...Array(3).fill("pump_signal"),
      ...Array(3).fill("cool_down"),
      ...Array(3).fill("leap_frog"),
      ...Array(3).fill("warty_lookout"),
      ...Array(3).fill("sticky_tongue"),
      ...Array(3).fill("chaos_croak"),
      ...Array(3).fill("junior_dev"),
    ];
    const createRes = await fetch(`${baseUrl}/api/decks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Owner's Deck", cards: legalDeck }),
    });
    const { deck } = (await createRes.json()) as { deck: { id: string } };

    const hijackRes = await fetch(`${baseUrl}/api/decks/${deck.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${intruder.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Hijacked", cards: legalDeck }),
    });
    expect(hijackRes.status).toBe(404);
  });

  it("grants the welcome bonus on first sign-in, readable via /api/coins", async () => {
    const { token } = await signIn();
    const res = await fetch(`${baseUrl}/api/coins`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { balance: number }).balance).toBe(WELCOME_BONUS_COINS);
  });

  it("rejects /api/coins with no Authorization header", async () => {
    const res = await fetch(`${baseUrl}/api/coins`);
    expect(res.status).toBe(401);
  });

  it("lists pack definitions with no auth required", async () => {
    const res = await fetch(`${baseUrl}/api/packs`);
    expect(res.status).toBe(200);
    const { packs } = (await res.json()) as { packs: { id: string; cost: number; cardCount: number }[] };
    expect(packs.find((p) => p.id === "standard")?.cost).toBe(PACK_DEFINITIONS.standard.cost);
  });

  it("opens a pack over HTTP: debits Coins and grants cards reflected in /api/collection", async () => {
    const { token } = await signIn();
    const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

    const openRes = await fetch(`${baseUrl}/api/packs/open`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packType: "standard" }),
    });
    expect(openRes.status).toBe(200);
    const { cards, balance } = (await openRes.json()) as { cards: { templateId: string; isFoil: boolean }[]; balance: number };
    expect(cards).toHaveLength(PACK_DEFINITIONS.standard.cardCount);
    expect(balance).toBe(WELCOME_BONUS_COINS - PACK_DEFINITIONS.standard.cost);

    const coinsRes = await fetch(`${baseUrl}/api/coins`, { headers: auth });
    expect(((await coinsRes.json()) as { balance: number }).balance).toBe(balance);
  });

  it("rejects opening a pack you can't afford with 402, and an unknown pack type with 400", async () => {
    const { token } = await signIn();
    const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

    // Spend the welcome bonus down to less than one pack's cost.
    const packsAffordable = Math.floor(WELCOME_BONUS_COINS / PACK_DEFINITIONS.standard.cost);
    for (let i = 0; i < packsAffordable; i++) {
      await fetch(`${baseUrl}/api/packs/open`, { method: "POST", headers: auth, body: JSON.stringify({ packType: "standard" }) });
    }

    const brokeRes = await fetch(`${baseUrl}/api/packs/open`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packType: "standard" }),
    });
    expect(brokeRes.status).toBe(402);

    const unknownRes = await fetch(`${baseUrl}/api/packs/open`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packType: "genesis-vault" }),
    });
    expect(unknownRes.status).toBe(400);
  });

  it("rejects /api/packs/open with no Authorization header", async () => {
    const res = await fetch(`${baseUrl}/api/packs/open`, { method: "POST", body: JSON.stringify({ packType: "standard" }) });
    expect(res.status).toBe(401);
  });
});
