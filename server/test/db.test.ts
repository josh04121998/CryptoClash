import { CARD_POOL, MAX_COPIES_PER_CARD } from "@cryptoclash/engine";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findOrCreateAccount } from "../src/accounts.js";
import { getCollectionCounts, grantCardInstances, grantStartingCollection, validateOwnership } from "../src/collectionRepo.js";
import { getBalance, grantWelcomeBonus, WELCOME_BONUS_COINS } from "../src/coinsRepo.js";
import { runMigrations } from "../src/migrate.js";
import { createDeck, deleteDeck, listDecks, updateDeck } from "../src/decksRepo.js";
import { InsufficientCoinsError, openPack, PACK_DEFINITIONS, rollPackCards, UnknownPackTypeError } from "../src/packsRepo.js";

// These hit a real Postgres — set DATABASE_URL (see server/README.md) to run them.
// They no-op (describe.skip) rather than fail when it's unset, so the rest of the
// suite stays green without a database available.
const databaseUrl = process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d("accounts + decks (integration, real Postgres)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Isolate each test — this suite owns the whole DB it's pointed at.
    await pool.query("delete from decks");
    await pool.query("delete from accounts");
  });

  describe("findOrCreateAccount", () => {
    it("creates an account on first sign-in and returns the same one on repeat sign-ins", async () => {
      const first = await findOrCreateAccount(pool, "0xAbC123");
      const second = await findOrCreateAccount(pool, "0xabc123"); // different case, same address
      expect(second.id).toBe(first.id);
      expect(second.walletAddress).toBe("0xabc123"); // stored lowercased
    });

    it("gives different wallets different accounts", async () => {
      const a = await findOrCreateAccount(pool, "0x111");
      const b = await findOrCreateAccount(pool, "0x222");
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("decks", () => {
    it("creates, lists, updates, and deletes a deck scoped to its account", async () => {
      const account = await findOrCreateAccount(pool, "0xdeckowner");
      const created = await createDeck(pool, account.id, "My Deck", ["pup_scout", "fast_fang"]);
      expect(created.name).toBe("My Deck");

      const listed = await listDecks(pool, account.id);
      expect(listed.map((d) => d.id)).toEqual([created.id]);

      const updated = await updateDeck(pool, account.id, created.id, "Renamed", ["moon_dog"]);
      expect(updated?.name).toBe("Renamed");
      expect(updated?.cards).toEqual(["moon_dog"]);

      const deleted = await deleteDeck(pool, account.id, created.id);
      expect(deleted).toBe(true);
      expect(await listDecks(pool, account.id)).toEqual([]);
    });

    it("never lets one account read, update, or delete another account's deck", async () => {
      const owner = await findOrCreateAccount(pool, "0xowner");
      const intruder = await findOrCreateAccount(pool, "0xintruder");
      const deck = await createDeck(pool, owner.id, "Private Deck", ["pup_scout"]);

      expect(await listDecks(pool, intruder.id)).toEqual([]);
      expect(await updateDeck(pool, intruder.id, deck.id, "Hijacked", ["moon_dog"])).toBeNull();
      expect(await deleteDeck(pool, intruder.id, deck.id)).toBe(false);

      // Confirm it's genuinely untouched.
      const stillOwners = await listDecks(pool, owner.id);
      expect(stillOwners[0].name).toBe("Private Deck");
    });

    it("deleting an account cascades to its decks", async () => {
      const account = await findOrCreateAccount(pool, "0xcascade");
      await createDeck(pool, account.id, "Deck", ["pup_scout"]);
      await pool.query("delete from accounts where id = $1", [account.id]);
      const remaining = await pool.query("select count(*)::int as count from decks");
      expect(remaining.rows[0].count).toBe(0);
    });
  });

  describe("collection", () => {
    it("grants MAX_COPIES_PER_CARD of every Common template, and stays idempotent on repeat grants", async () => {
      const account = await findOrCreateAccount(pool, "0xcollector");
      await grantStartingCollection(pool, account.id);

      const owned = await getCollectionCounts(pool, account.id);
      const commonIds = Object.values(CARD_POOL).filter((t) => !t.token && t.rarity === "Common").map((t) => t.id);
      for (const id of commonIds) expect(owned[id]).toBe(MAX_COPIES_PER_CARD);

      // Uncommon-and-above is now pack-only — the starting grant doesn't touch it.
      const aboveCommonIds = Object.values(CARD_POOL).filter((t) => !t.token && t.rarity && t.rarity !== "Common").map((t) => t.id);
      for (const id of aboveCommonIds) expect(owned[id]).toBeUndefined();

      // Tokens are summon-only, never deck-legal — never granted as owned instances.
      const tokenIds = Object.values(CARD_POOL).filter((t) => t.token).map((t) => t.id);
      for (const id of tokenIds) expect(owned[id]).toBeUndefined();

      // Calling it again shouldn't duplicate instances (top-up, not additive).
      await grantStartingCollection(pool, account.id);
      const ownedAgain = await getCollectionCounts(pool, account.id);
      expect(ownedAgain["pup_scout"]).toBe(MAX_COPIES_PER_CARD);
    });

    it("scopes ownership per-account", async () => {
      const collector = await findOrCreateAccount(pool, "0xhasit");
      const bystander = await findOrCreateAccount(pool, "0xdoesnthaveit");
      await grantStartingCollection(pool, collector.id);

      expect((await getCollectionCounts(pool, collector.id))["pup_scout"]).toBe(MAX_COPIES_PER_CARD);
      expect((await getCollectionCounts(pool, bystander.id))["pup_scout"]).toBeUndefined();
    });

    it("validateOwnership passes a deck within owned copies and flags one that exceeds them", async () => {
      const account = await findOrCreateAccount(pool, "0xdeckowner2");
      await grantStartingCollection(pool, account.id);

      expect(await validateOwnership(pool, account.id, Array(MAX_COPIES_PER_CARD).fill("pup_scout"))).toEqual([]);

      const tooMany = await validateOwnership(pool, account.id, Array(MAX_COPIES_PER_CARD + 1).fill("pup_scout"));
      expect(tooMany).toHaveLength(1);
      expect(tooMany[0]).toMatch(/Pup Scout/);

      // A different account that never had a collection granted owns nothing.
      const other = await findOrCreateAccount(pool, "0xnocollection");
      expect(await validateOwnership(pool, other.id, ["pup_scout"])).toHaveLength(1);
    });
  });

  describe("coins", () => {
    it("grants the welcome bonus exactly once and tracks balance", async () => {
      const account = await findOrCreateAccount(pool, "0xcoinowner");
      expect(await getBalance(pool, account.id)).toBe(0);

      await grantWelcomeBonus(pool, account.id);
      expect(await getBalance(pool, account.id)).toBe(WELCOME_BONUS_COINS);

      // Not idempotent by itself — callers gate this on Account.isNew (see httpApi.ts) so it
      // only ever runs once per account; calling it again (as a caller bug would) really does add more.
      await grantWelcomeBonus(pool, account.id);
      expect(await getBalance(pool, account.id)).toBe(WELCOME_BONUS_COINS * 2);
    });

    it("scopes balance per-account", async () => {
      const a = await findOrCreateAccount(pool, "0xcoinsa");
      const b = await findOrCreateAccount(pool, "0xcoinsb");
      await grantWelcomeBonus(pool, a.id);
      expect(await getBalance(pool, a.id)).toBe(WELCOME_BONUS_COINS);
      expect(await getBalance(pool, b.id)).toBe(0);
    });
  });

  describe("packs", () => {
    it("rollPackCards is pure and deterministic for a given seed", () => {
      const first = rollPackCards("standard", 42);
      const second = rollPackCards("standard", 42);
      expect(first).toEqual(second);
      expect(first).toHaveLength(PACK_DEFINITIONS.standard.cardCount);
      for (const id of first) expect(CARD_POOL[id]).toBeDefined();
    });

    it("rejects an unknown pack type", () => {
      expect(() => rollPackCards("legendary-vault", 1)).toThrow(UnknownPackTypeError);
    });

    it("opens a pack: debits Coins, grants card instances, and logs the roll", async () => {
      const account = await findOrCreateAccount(pool, "0xpackbuyer");
      await grantWelcomeBonus(pool, account.id);
      const before = await getBalance(pool, account.id);

      const result = await openPack(pool, account.id, "standard");
      expect(result.cards).toHaveLength(PACK_DEFINITIONS.standard.cardCount);
      expect(result.balance).toBe(before - PACK_DEFINITIONS.standard.cost);
      expect(await getBalance(pool, account.id)).toBe(result.balance);

      const owned = await getCollectionCounts(pool, account.id);
      const rolledCounts = new Map<string, number>();
      for (const id of result.cards) rolledCounts.set(id, (rolledCounts.get(id) ?? 0) + 1);
      for (const [id, count] of rolledCounts) {
        // >= not ===, since a Common could already be part of the starting collection.
        expect(owned[id]).toBeGreaterThanOrEqual(count);
      }

      const logged = await pool.query<{ cards: string[]; coins_spent: number }>(
        "select cards, coins_spent from pack_openings where account_id = $1",
        [account.id],
      );
      expect(logged.rows).toHaveLength(1);
      expect(logged.rows[0].cards).toEqual(result.cards);
      expect(logged.rows[0].coins_spent).toBe(PACK_DEFINITIONS.standard.cost);
    });

    it("rejects opening a pack without enough Coins, without charging or granting anything", async () => {
      const account = await findOrCreateAccount(pool, "0xbroke");
      await expect(openPack(pool, account.id, "standard")).rejects.toThrow(InsufficientCoinsError);

      expect(await getBalance(pool, account.id)).toBe(0);
      expect(await getCollectionCounts(pool, account.id)).toEqual({});
    });

    it("grantCardInstances adds duplicates as separate owned instances rather than topping up", async () => {
      const account = await findOrCreateAccount(pool, "0xduplicator");
      const client = await pool.connect();
      try {
        await grantCardInstances(client, account.id, ["moon_dog", "moon_dog", "moon_dog", "moon_dog"]);
      } finally {
        client.release();
      }
      // Four instances even though MAX_COPIES_PER_CARD is 3 — duplicates beyond deck-legal
      // copies are still real collection value (spec.md Section 18), not silently dropped.
      expect((await getCollectionCounts(pool, account.id))["moon_dog"]).toBe(4);
    });
  });
});
