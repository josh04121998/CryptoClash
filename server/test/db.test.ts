import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findOrCreateAccount } from "../src/accounts.js";
import { runMigrations } from "../src/migrate.js";
import { createDeck, deleteDeck, listDecks, updateDeck } from "../src/decksRepo.js";

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
});
