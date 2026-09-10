import { CARD_POOL, MAX_COPIES_PER_CARD } from "@cryptoclash/engine";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findOrCreateAccount } from "../src/accounts.js";
import {
  AchievementAlreadyClaimedError,
  AchievementNotCompleteError,
  ACHIEVEMENT_DEFS,
  claimAchievement,
  getMyAchievements,
  recordAchievementProgress,
  recordMatchOutcomeForAchievements,
  UnknownAchievementError,
} from "../src/achievementsRepo.js";
import { getCollectionCounts, getCollectionSummary, grantCardInstances, grantStartingCollection, validateOwnership } from "../src/collectionRepo.js";
import { awardMatchResult, getBalance, grantWelcomeBonus, WELCOME_BONUS_COINS } from "../src/coinsRepo.js";
import { AlreadyClaimedTodayError, claimDaily, DAILY_REWARDS, getDailyStatus } from "../src/dailyRepo.js";
import { deleteEvent, getActiveEvent, upsertEvent } from "../src/eventsRepo.js";
import {
  getMyCoinsEarned,
  getMyWinRate,
  getMyWins,
  getTopCoinsEarned,
  getTopWinRate,
  getTopWins,
  MIN_GAMES_FOR_WIN_RATE,
} from "../src/leaderboardRepo.js";
import { runMigrations } from "../src/migrate.js";
import { awardRankPoints, getMyRank, getTopRank, RANK_TIERS } from "../src/rankRepo.js";
import {
  getOrCreateReferralCode,
  getReferralStats,
  recordReferralSignup,
  rewardReferrerIfPending,
} from "../src/referralsRepo.js";
import { createDeck, deleteDeck, listDecks, updateDeck } from "../src/decksRepo.js";
import {
  claimQuest,
  QuestAlreadyClaimedError,
  QuestNotCompleteError,
  recordQuestProgress,
  UnknownQuestError,
  getTodayQuests,
} from "../src/questsRepo.js";
import {
  craftCard,
  disenchantCards,
  getDustBalance,
  InsufficientCopiesError,
  InsufficientDustError,
  InvalidTemplateError,
} from "../src/craftingRepo.js";
import { InsufficientCoinsError, openPack, PACK_DEFINITIONS, rollPackCards, UnknownPackTypeError } from "../src/packsRepo.js";
import { AlreadyClaimedThisWeekError, claimWeekly, getWeeklyStatus, WEEKLY_REWARDS } from "../src/weeklyRepo.js";

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
    await pool.query("delete from events"); // not account-scoped, so not covered by the cascade above
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

    // Session 20: matches no longer pay Coins at all (spec.md Section 21's "Anti-farming
    // redesign") — awardMatchResult now only logs a zero-amount audit row, kept purely so
    // leaderboardRepo.ts's win/loss aggregates (which read coin_transactions.reason) still work.
    it("awardMatchResult logs a zero-amount, correctly-reasoned audit row and never changes the balance", async () => {
      const account = await findOrCreateAccount(pool, "0xmatchplayer");

      await awardMatchResult(pool, account.id, "win");
      await awardMatchResult(pool, account.id, "loss");
      await awardMatchResult(pool, account.id, "draw");
      expect(await getBalance(pool, account.id)).toBe(0);

      const rows = (
        await pool.query<{ amount: number; reason: string }>(
          "select amount, reason from coin_transactions where account_id = $1 order by created_at",
          [account.id],
        )
      ).rows;
      expect(rows).toEqual([
        { amount: 0, reason: "match_win" },
        { amount: 0, reason: "match_loss" },
        { amount: 0, reason: "match_draw" },
      ]);
    });

    it("scopes the match-result audit row per-account", async () => {
      const a = await findOrCreateAccount(pool, "0xmatcha");
      const b = await findOrCreateAccount(pool, "0xmatchb");
      await awardMatchResult(pool, a.id, "win");
      const bRows = await pool.query("select 1 from coin_transactions where account_id = $1", [b.id]);
      expect(bRows.rowCount).toBe(0);
    });
  });

  describe("packs", () => {
    it("rollPackCards is pure and deterministic for a given seed", () => {
      const first = rollPackCards("standard", 42);
      const second = rollPackCards("standard", 42);
      expect(first).toEqual(second);
      expect(first).toHaveLength(PACK_DEFINITIONS.standard.cardCount);
      for (const card of first) {
        expect(CARD_POOL[card.templateId]).toBeDefined();
        expect(typeof card.isFoil).toBe("boolean");
      }
    });

    it("rejects an unknown pack type", () => {
      expect(() => rollPackCards("legendary-vault", 1)).toThrow(UnknownPackTypeError);
    });

    it("never rolls Mythic or Genesis — those are event/achievement-only, not pack RNG", () => {
      // A sweep of seeds rather than one lucky/unlucky roll — the guard is a hard exclusion
      // (PACK_ELIGIBLE_RARITIES in packsRepo.ts), not just an unlikely outcome to not hit.
      for (let seed = 0; seed < 500; seed++) {
        for (const card of rollPackCards("standard", seed)) {
          const rarity = CARD_POOL[card.templateId].rarity;
          expect(rarity).not.toBe("Mythic");
          expect(rarity).not.toBe("Genesis");
        }
      }
    });

    it("rolls foils at a real, nonzero-but-minority rate across many packs", () => {
      let foilCount = 0;
      let totalCount = 0;
      for (let seed = 0; seed < 500; seed++) {
        for (const card of rollPackCards("standard", seed)) {
          totalCount++;
          if (card.isFoil) foilCount++;
        }
      }
      const rate = foilCount / totalCount;
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(0.2);
    });

    it("opens a pack: debits Coins, grants card instances (foils included), and logs the roll", async () => {
      const account = await findOrCreateAccount(pool, "0xpackbuyer");
      await grantWelcomeBonus(pool, account.id);
      const before = await getBalance(pool, account.id);

      const result = await openPack(pool, account.id, "standard");
      expect(result.cards).toHaveLength(PACK_DEFINITIONS.standard.cardCount);
      expect(result.balance).toBe(before - PACK_DEFINITIONS.standard.cost);
      expect(await getBalance(pool, account.id)).toBe(result.balance);

      const owned = await getCollectionCounts(pool, account.id);
      const rolledCounts = new Map<string, number>();
      for (const card of result.cards) rolledCounts.set(card.templateId, (rolledCounts.get(card.templateId) ?? 0) + 1);
      for (const [id, count] of rolledCounts) {
        // >= not ===, since a Common could already be part of the starting collection.
        expect(owned[id]).toBeGreaterThanOrEqual(count);
      }

      const foilsPulled = result.cards.filter((c) => c.isFoil);
      if (foilsPulled.length > 0) {
        const { foils: foilOwned } = await getCollectionSummary(pool, account.id);
        for (const card of foilsPulled) expect(foilOwned[card.templateId]).toBeGreaterThanOrEqual(1);
      }

      const logged = await pool.query<{ cards: { templateId: string; isFoil: boolean }[]; coins_spent: number }>(
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

    it("grantCardInstances adds duplicates as separate owned instances rather than topping up, preserving is_foil", async () => {
      const account = await findOrCreateAccount(pool, "0xduplicator");
      const client = await pool.connect();
      try {
        await grantCardInstances(client, account.id, [
          { templateId: "moon_dog", isFoil: false },
          { templateId: "moon_dog", isFoil: true },
          { templateId: "moon_dog", isFoil: false },
          { templateId: "moon_dog", isFoil: true },
        ]);
      } finally {
        client.release();
      }
      // Four instances even though MAX_COPIES_PER_CARD is 3 — duplicates beyond deck-legal
      // copies are still real collection value (spec.md Section 18), not silently dropped.
      expect((await getCollectionCounts(pool, account.id))["moon_dog"]).toBe(4);
      expect((await getCollectionSummary(pool, account.id)).foils["moon_dog"]).toBe(2);
    });
  });

  describe("crafting (disenchant + craft)", () => {
    it("disenchants owned Rares into Dust and removes them from the collection", async () => {
      const account = await findOrCreateAccount(pool, "0xdisenchanter");
      const client = await pool.connect();
      try {
        await grantCardInstances(client, account.id, [
          { templateId: "moon_dog", isFoil: false },
          { templateId: "moon_dog", isFoil: false },
        ]);
      } finally {
        client.release();
      }

      const result = await disenchantCards(pool, account.id, "moon_dog", 2);
      expect(result.dustEarned).toBe(40); // Rare = 20 Dust each
      expect(result.balance).toBe(40);
      expect(await getDustBalance(pool, account.id)).toBe(40);
      expect((await getCollectionCounts(pool, account.id))["moon_dog"] ?? 0).toBe(0);
    });

    it("prefers disenchanting non-foil copies first, protecting a foil pull by default", async () => {
      const account = await findOrCreateAccount(pool, "0xfoilprotector");
      const client = await pool.connect();
      try {
        await grantCardInstances(client, account.id, [
          { templateId: "moon_dog", isFoil: true },
          { templateId: "moon_dog", isFoil: false },
          { templateId: "moon_dog", isFoil: false },
        ]);
      } finally {
        client.release();
      }

      await disenchantCards(pool, account.id, "moon_dog", 2);
      const { owned, foils } = await getCollectionSummary(pool, account.id);
      expect(owned["moon_dog"]).toBe(1);
      expect(foils["moon_dog"]).toBe(1); // the foil copy survives — the two non-foils were disenchanted first
    });

    it("rejects disenchanting more copies than owned, without charging or granting Dust", async () => {
      const account = await findOrCreateAccount(pool, "0xshort");
      await expect(disenchantCards(pool, account.id, "moon_dog", 1)).rejects.toThrow(InsufficientCopiesError);
      expect(await getDustBalance(pool, account.id)).toBe(0);
    });

    it("rejects disenchanting/crafting Common (starting-collection farm guard) and unknown/token templates", async () => {
      const account = await findOrCreateAccount(pool, "0xguardrail");
      // Common — excluded so disenchant->resign-in->re-grant can't farm infinite Dust.
      await expect(disenchantCards(pool, account.id, "pup_scout", 1)).rejects.toThrow(InvalidTemplateError);
      await expect(craftCard(pool, account.id, "pup_scout")).rejects.toThrow(InvalidTemplateError);
      // Token — never a real collectible.
      await expect(craftCard(pool, account.id, "puppy")).rejects.toThrow(InvalidTemplateError);
      // Unknown id.
      await expect(craftCard(pool, account.id, "not_a_real_card")).rejects.toThrow(InvalidTemplateError);
    });

    it("crafts a card by spending Dust, granting a non-foil standard instance", async () => {
      const account = await findOrCreateAccount(pool, "0xcrafter");
      const client = await pool.connect();
      try {
        // Disenchant enough Rares to afford one Rare craft (100 Dust) from 5 x 20 = 100.
        await grantCardInstances(
          client,
          account.id,
          Array.from({ length: 5 }, () => ({ templateId: "moon_dog", isFoil: false })),
        );
      } finally {
        client.release();
      }
      await disenchantCards(pool, account.id, "moon_dog", 5);
      expect(await getDustBalance(pool, account.id)).toBe(100);

      const result = await craftCard(pool, account.id, "guard_dog"); // also Rare, cost 100
      expect(result.balance).toBe(0);
      expect((await getCollectionCounts(pool, account.id))["guard_dog"]).toBe(1);
      expect((await getCollectionSummary(pool, account.id)).foils["guard_dog"] ?? 0).toBe(0); // crafted cards are never foil
    });

    it("rejects crafting without enough Dust, without granting a card", async () => {
      const account = await findOrCreateAccount(pool, "0xpoor");
      await expect(craftCard(pool, account.id, "moon_dog")).rejects.toThrow(InsufficientDustError);
      expect((await getCollectionCounts(pool, account.id))["moon_dog"] ?? 0).toBe(0);
    });
  });

  describe("daily login rewards", () => {
    it("claims the first-ever daily reward with streak 1", async () => {
      const account = await findOrCreateAccount(pool, "0xdailyfirst");
      const status = await getDailyStatus(pool, account.id);
      expect(status.claimedToday).toBe(false);
      expect(status.streak).toBe(0);
      expect(status.nextRewardCoins).toBe(DAILY_REWARDS[0]);

      const result = await claimDaily(pool, account.id);
      expect(result.streak).toBe(1);
      expect(result.coinsEarned).toBe(DAILY_REWARDS[0]);
      expect(result.balance).toBe(DAILY_REWARDS[0]);
      expect(await getBalance(pool, account.id)).toBe(DAILY_REWARDS[0]);

      const after = await getDailyStatus(pool, account.id);
      expect(after.claimedToday).toBe(true);
      expect(after.streak).toBe(1);
    });

    it("rejects claiming twice in the same UTC day, without double-crediting", async () => {
      const account = await findOrCreateAccount(pool, "0xdailytwice");
      await claimDaily(pool, account.id);
      await expect(claimDaily(pool, account.id)).rejects.toThrow(AlreadyClaimedTodayError);
      expect(await getBalance(pool, account.id)).toBe(DAILY_REWARDS[0]);
    });

    it("extends the streak when the previous claim was yesterday, and resets it after a gap", async () => {
      const account = await findOrCreateAccount(pool, "0xdailystreak");
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      await pool.query("update accounts set last_daily_claim_day = $1, daily_streak = 3 where id = $2", [
        yesterday.toISOString().slice(0, 10),
        account.id,
      ]);
      const extended = await claimDaily(pool, account.id);
      expect(extended.streak).toBe(4);
      expect(extended.coinsEarned).toBe(DAILY_REWARDS[3]);

      const twoDaysAgo = new Date();
      twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
      await pool.query("update accounts set last_daily_claim_day = $1, daily_streak = 4 where id = $2", [
        twoDaysAgo.toISOString().slice(0, 10),
        account.id,
      ]);
      const reset = await claimDaily(pool, account.id);
      expect(reset.streak).toBe(1);
      expect(reset.coinsEarned).toBe(DAILY_REWARDS[0]);
    });

    it("cycles the reward table past day 7 rather than capping the streak", async () => {
      const account = await findOrCreateAccount(pool, "0xdailycycle");
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      await pool.query("update accounts set last_daily_claim_day = $1, daily_streak = 7 where id = $2", [
        yesterday.toISOString().slice(0, 10),
        account.id,
      ]);
      const result = await claimDaily(pool, account.id);
      expect(result.streak).toBe(8);
      expect(result.coinsEarned).toBe(DAILY_REWARDS[0]); // (8-1) % 7 === 0, back to day-1's rate
    });
  });

  describe("quests", () => {
    it("starts every quest at 0 progress, unclaimed", async () => {
      const account = await findOrCreateAccount(pool, "0xqueststart");
      const quests = await getTodayQuests(pool, account.id);
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.progress).toBe(0);
        expect(q.claimed).toBe(false);
      }
    });

    it("recordQuestProgress advances only the matching track, capped at each quest's goal", async () => {
      const account = await findOrCreateAccount(pool, "0xquestplay");
      await recordQuestProgress(pool, account.id, "play");
      await recordQuestProgress(pool, account.id, "play");
      const quests = await getTodayQuests(pool, account.id);
      expect(quests.find((q) => q.id === "play_1")!.progress).toBe(1); // goal 1, capped despite 2 records
      expect(quests.find((q) => q.id === "play_3")!.progress).toBe(2);
      expect(quests.find((q) => q.id === "win_1")!.progress).toBe(0); // never recorded on the "win" track
    });

    it("claims a completed quest exactly once, crediting Coins", async () => {
      const account = await findOrCreateAccount(pool, "0xquestclaim");
      await recordQuestProgress(pool, account.id, "play");
      const result = await claimQuest(pool, account.id, "play_1");
      expect(result.coinsEarned).toBe(50);
      expect(result.balance).toBe(50);
      expect(await getBalance(pool, account.id)).toBe(50);

      await expect(claimQuest(pool, account.id, "play_1")).rejects.toThrow(QuestAlreadyClaimedError);
      expect(await getBalance(pool, account.id)).toBe(50); // unchanged — no double-credit
    });

    it("rejects claiming an incomplete or unknown quest", async () => {
      const account = await findOrCreateAccount(pool, "0xquestincomplete");
      await expect(claimQuest(pool, account.id, "play_1")).rejects.toThrow(QuestNotCompleteError);
      await expect(claimQuest(pool, account.id, "not_a_real_quest")).rejects.toThrow(UnknownQuestError);
    });
  });

  describe("leaderboard", () => {
    it("ranks accounts by wins, most first, and omits accounts with zero wins", async () => {
      const a = await findOrCreateAccount(pool, "0xleaderwinsa");
      const b = await findOrCreateAccount(pool, "0xleaderwinsb");
      const c = await findOrCreateAccount(pool, "0xleaderwinsc");
      await awardMatchResult(pool, a.id, "win");
      await awardMatchResult(pool, a.id, "win");
      await awardMatchResult(pool, a.id, "win");
      await awardMatchResult(pool, b.id, "win");
      // c never wins — should never appear on this board.

      const top = await getTopWins(pool);
      const aEntry = top.find((e) => e.walletAddress === "0xleaderwinsa");
      const bEntry = top.find((e) => e.walletAddress === "0xleaderwinsb");
      expect(aEntry?.wins).toBe(3);
      expect(bEntry?.wins).toBe(1);
      expect(aEntry!.rank).toBeLessThan(bEntry!.rank);
      expect(top.some((e) => e.walletAddress === "0xleaderwinsc")).toBe(false);

      expect(await getMyWins(pool, a.id)).toEqual({ wins: 3, rank: aEntry!.rank });
      expect(await getMyWins(pool, c.id)).toEqual({ wins: 0, rank: null });
    });

    it("ranks accounts by lifetime Coins earned, unaffected by later spending", async () => {
      const spender = await findOrCreateAccount(pool, "0xleadercoinsspender");
      const saver = await findOrCreateAccount(pool, "0xleadercoinssaver");
      await grantWelcomeBonus(pool, spender.id);
      await grantWelcomeBonus(pool, saver.id);
      await openPack(pool, spender.id, "standard"); // spends Coins — shouldn't reduce "earned"

      const earnedSpender = await getMyCoinsEarned(pool, spender.id);
      const earnedSaver = await getMyCoinsEarned(pool, saver.id);
      expect(earnedSpender.coinsEarned).toBe(WELCOME_BONUS_COINS);
      expect(earnedSaver.coinsEarned).toBe(WELCOME_BONUS_COINS);
      expect(await getBalance(pool, spender.id)).toBeLessThan(earnedSpender.coinsEarned);

      const top = await getTopCoinsEarned(pool);
      expect(top.some((e) => e.walletAddress === "0xleadercoinsspender" && e.coinsEarned === WELCOME_BONUS_COINS)).toBe(true);
    });

    it("excludes accounts under MIN_GAMES_FOR_WIN_RATE from the win-rate board, but still reports their raw stats", async () => {
      const veteran = await findOrCreateAccount(pool, "0xleaderwinratevet");
      const rookie = await findOrCreateAccount(pool, "0xleaderwinraterookie");
      for (let i = 0; i < MIN_GAMES_FOR_WIN_RATE; i++) {
        await awardMatchResult(pool, veteran.id, i === 0 ? "loss" : "win");
      }
      await awardMatchResult(pool, rookie.id, "win"); // 1 game — below threshold

      const top = await getTopWinRate(pool);
      expect(top.some((e) => e.walletAddress === "0xleaderwinratevet")).toBe(true);
      expect(top.some((e) => e.walletAddress === "0xleaderwinraterookie")).toBe(false);

      const veteranStats = await getMyWinRate(pool, veteran.id);
      expect(veteranStats.games).toBe(MIN_GAMES_FOR_WIN_RATE);
      expect(veteranStats.wins).toBe(MIN_GAMES_FOR_WIN_RATE - 1);
      expect(veteranStats.rank).not.toBeNull();

      const rookieStats = await getMyWinRate(pool, rookie.id);
      expect(rookieStats.games).toBe(1);
      expect(rookieStats.wins).toBe(1);
      expect(rookieStats.rank).toBeNull();
    });
  });

  describe("referrals", () => {
    it("lazily generates a stable, unique referral code", async () => {
      const a = await findOrCreateAccount(pool, "0xreferrercodea");
      const b = await findOrCreateAccount(pool, "0xreferrercodeb");
      const codeA1 = await getOrCreateReferralCode(pool, a.id);
      const codeA2 = await getOrCreateReferralCode(pool, a.id);
      const codeB = await getOrCreateReferralCode(pool, b.id);
      expect(codeA1).toBe(codeA2);
      expect(codeA1).not.toBe(codeB);
    });

    it("grants the referred account a free pack immediately, and records a pending referral", async () => {
      const referrer = await findOrCreateAccount(pool, "0xreferrer1");
      const code = await getOrCreateReferralCode(pool, referrer.id);
      const referred = await findOrCreateAccount(pool, "0xreferred1");

      const result = await recordReferralSignup(pool, referred.id, code);
      expect(result).not.toBeNull();
      expect(result!.referrerId).toBe(referrer.id);
      expect(result!.cards).toHaveLength(PACK_DEFINITIONS.standard.cardCount);

      // Free — a real card grant with coins_spent 0, not a special-case row shape.
      const logged = await pool.query<{ coins_spent: number }>("select coins_spent from pack_openings where account_id = $1", [referred.id]);
      expect(logged.rows[0].coins_spent).toBe(0);
      expect(Object.keys(await getCollectionCounts(pool, referred.id)).length).toBeGreaterThan(0);

      const stats = await getReferralStats(pool, referrer.id);
      expect(stats.pending).toBe(1);
      expect(stats.rewarded).toBe(0);
      expect(stats.totalReferred).toBe(1);
    });

    it("returns null (no-op) for an unknown code or a self-referral, granting nothing", async () => {
      const account = await findOrCreateAccount(pool, "0xreferralnoop");
      expect(await recordReferralSignup(pool, account.id, "not-a-real-code")).toBeNull();

      const own = await getOrCreateReferralCode(pool, account.id);
      expect(await recordReferralSignup(pool, account.id, own)).toBeNull(); // referrerId === referredAccountId
      expect(Object.keys(await getCollectionCounts(pool, account.id))).toHaveLength(0);
    });

    it("rewards the referrer exactly once, the first time the referred account's match completes", async () => {
      const referrer = await findOrCreateAccount(pool, "0xreferrer2");
      const code = await getOrCreateReferralCode(pool, referrer.id);
      const referred = await findOrCreateAccount(pool, "0xreferred2");
      await recordReferralSignup(pool, referred.id, code);

      const reward = await rewardReferrerIfPending(pool, referred.id);
      expect(reward).not.toBeNull();
      expect(reward!.referrerId).toBe(referrer.id);
      expect(reward!.cards).toHaveLength(PACK_DEFINITIONS.standard.cardCount);
      expect(Object.keys(await getCollectionCounts(pool, referrer.id)).length).toBeGreaterThan(0);

      // A second "match completion" for the same referred account shouldn't pay out again.
      const again = await rewardReferrerIfPending(pool, referred.id);
      expect(again).toBeNull();

      const stats = await getReferralStats(pool, referrer.id);
      expect(stats.rewarded).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it("is a no-op for an account with no pending referral", async () => {
      const account = await findOrCreateAccount(pool, "0xneverreferred");
      expect(await rewardReferrerIfPending(pool, account.id)).toBeNull();
    });
  });

  describe("weekly rewards", () => {
    it("claims the first-ever weekly reward with streak 1", async () => {
      const account = await findOrCreateAccount(pool, "0xweeklyfirst");
      const status = await getWeeklyStatus(pool, account.id);
      expect(status.claimedThisWeek).toBe(false);
      expect(status.streak).toBe(0);
      expect(status.nextRewardCoins).toBe(WEEKLY_REWARDS[0]);

      const result = await claimWeekly(pool, account.id);
      expect(result.streak).toBe(1);
      expect(result.coinsEarned).toBe(WEEKLY_REWARDS[0]);
      expect(result.balance).toBe(WEEKLY_REWARDS[0]);
      expect(await getBalance(pool, account.id)).toBe(WEEKLY_REWARDS[0]);

      const after = await getWeeklyStatus(pool, account.id);
      expect(after.claimedThisWeek).toBe(true);
      expect(after.streak).toBe(1);
    });

    it("rejects claiming twice in the same ISO week, without double-crediting", async () => {
      const account = await findOrCreateAccount(pool, "0xweeklytwice");
      await claimWeekly(pool, account.id);
      await expect(claimWeekly(pool, account.id)).rejects.toThrow(AlreadyClaimedThisWeekError);
      expect(await getBalance(pool, account.id)).toBe(WEEKLY_REWARDS[0]);
    });

    it("extends the streak when the previous claim was last week, and resets it after a gap", async () => {
      const account = await findOrCreateAccount(pool, "0xweeklystreak");
      const lastWeek = new Date();
      lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
      await pool.query("update accounts set last_weekly_claim_week = $1, weekly_streak = 2 where id = $2", [
        isoWeekOfForTest(lastWeek),
        account.id,
      ]);
      const extended = await claimWeekly(pool, account.id);
      expect(extended.streak).toBe(3);
      expect(extended.coinsEarned).toBe(WEEKLY_REWARDS[2]);

      const twoWeeksAgo = new Date();
      twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14);
      await pool.query("update accounts set last_weekly_claim_week = $1, weekly_streak = 3 where id = $2", [
        isoWeekOfForTest(twoWeeksAgo),
        account.id,
      ]);
      const reset = await claimWeekly(pool, account.id);
      expect(reset.streak).toBe(1);
      expect(reset.coinsEarned).toBe(WEEKLY_REWARDS[0]);
    });

    it("cycles the reward table past week 4 rather than capping the streak", async () => {
      const account = await findOrCreateAccount(pool, "0xweeklycycle");
      const lastWeek = new Date();
      lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
      await pool.query("update accounts set last_weekly_claim_week = $1, weekly_streak = 4 where id = $2", [
        isoWeekOfForTest(lastWeek),
        account.id,
      ]);
      const result = await claimWeekly(pool, account.id);
      expect(result.streak).toBe(5);
      expect(result.coinsEarned).toBe(WEEKLY_REWARDS[0]); // (5-1) % 4 === 0, back to week-1's rate
    });
  });

  describe("achievements", () => {
    it("starts every achievement at 0 progress, unclaimed", async () => {
      const account = await findOrCreateAccount(pool, "0xachievestart");
      const achievements = await getMyAchievements(pool, account.id);
      expect(achievements.length).toBe(ACHIEVEMENT_DEFS.length);
      for (const a of achievements) {
        expect(a.progress).toBe(0);
        expect(a.claimed).toBe(false);
      }
    });

    it("recordAchievementProgress increments only the matching track, capped at each achievement's goal", async () => {
      const account = await findOrCreateAccount(pool, "0xachieveincrement");
      await recordAchievementProgress(pool, account.id, "pack_opened_total", 1);
      await recordAchievementProgress(pool, account.id, "pack_opened_total", 1);
      const achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "packs_25")!.progress).toBe(2);
      expect(achievements.find((a) => a.id === "win_10")!.progress).toBe(0); // never recorded on that track
    });

    it("recordAchievementProgress in 'max' mode keeps the greatest value reported, not a running sum", async () => {
      const account = await findOrCreateAccount(pool, "0xachievemax");
      await recordAchievementProgress(pool, account.id, "win_streak", 3);
      await recordAchievementProgress(pool, account.id, "win_streak", 1); // a broken/shorter streak shouldn't erase the record
      let achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "win_streak_5")!.progress).toBe(3);

      await recordAchievementProgress(pool, account.id, "win_streak", 5);
      achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "win_streak_5")!.progress).toBe(5); // capped at the goal too
    });

    it("recordMatchOutcomeForAchievements advances win_total and win_streak on a win, and resets the live streak on a loss/draw", async () => {
      const account = await findOrCreateAccount(pool, "0xachievematch");
      await recordMatchOutcomeForAchievements(pool, account.id, "win");
      await recordMatchOutcomeForAchievements(pool, account.id, "win");
      let achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "win_10")!.progress).toBe(2);
      expect(achievements.find((a) => a.id === "win_streak_5")!.progress).toBe(2); // best streak so far: 2

      await recordMatchOutcomeForAchievements(pool, account.id, "loss");
      const row = await pool.query<{ current_win_streak: number }>("select current_win_streak from accounts where id = $1", [account.id]);
      expect(row.rows[0].current_win_streak).toBe(0); // live streak reset...

      await recordMatchOutcomeForAchievements(pool, account.id, "win");
      achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "win_10")!.progress).toBe(3); // ...but win_total keeps counting
      expect(achievements.find((a) => a.id === "win_streak_5")!.progress).toBe(2); // ...and the best-streak record survives the reset
    });

    it("claims a completed achievement exactly once, crediting Coins", async () => {
      const account = await findOrCreateAccount(pool, "0xachieveclaim");
      for (let i = 0; i < 10; i++) await recordAchievementProgress(pool, account.id, "win_total", 1);
      const result = await claimAchievement(pool, account.id, "win_10");
      expect(result.coinsEarned).toBe(300);
      expect(result.balance).toBe(300);
      expect(await getBalance(pool, account.id)).toBe(300);

      await expect(claimAchievement(pool, account.id, "win_10")).rejects.toThrow(AchievementAlreadyClaimedError);
      expect(await getBalance(pool, account.id)).toBe(300); // unchanged — no double-credit
    });

    it("rejects claiming an incomplete or unknown achievement", async () => {
      const account = await findOrCreateAccount(pool, "0xachieveincomplete");
      await expect(claimAchievement(pool, account.id, "win_10")).rejects.toThrow(AchievementNotCompleteError);
      await expect(claimAchievement(pool, account.id, "not_a_real_achievement")).rejects.toThrow(UnknownAchievementError);
    });

    it("advances craft_legendary only when the crafted template is actually Legendary", async () => {
      const legendaryId = Object.values(CARD_POOL).find((t) => t.rarity === "Legendary" && !t.token)!.id;
      const nonLegendaryId = Object.values(CARD_POOL).find((t) => t.rarity === "Rare" && !t.token)!.id;

      const account = await findOrCreateAccount(pool, "0xachievecraft");
      // craftCard doesn't require owning a copy first — just enough Dust; give plenty directly
      // rather than round-tripping through disenchant.
      await pool.query("update accounts set dust_balance = 5000 where id = $1", [account.id]);

      await craftCard(pool, account.id, nonLegendaryId);
      let achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "craft_legendary")!.progress).toBe(0);

      await craftCard(pool, account.id, legendaryId);
      achievements = await getMyAchievements(pool, account.id);
      expect(achievements.find((a) => a.id === "craft_legendary")!.progress).toBe(1);
    });
  });

  describe("ranked progression", () => {
    it("awards points per match outcome and derives the right tier", async () => {
      const account = await findOrCreateAccount(pool, "0xrankbasic");
      await awardRankPoints(pool, account.id, "win");
      await awardRankPoints(pool, account.id, "win");
      await awardRankPoints(pool, account.id, "loss");
      // 20 + 20 - 10 = 30 points — still Bronze (min 0), below Silver's 150.
      const status = await getMyRank(pool, account.id);
      expect(status.points).toBe(30);
      expect(status.tier.name).toBe("Bronze");
      expect(status.nextTier?.name).toBe("Silver");
      expect(status.pointsToNextTier).toBe(150 - 30);
    });

    it("floors a net-negative points total at 0 rather than going negative", async () => {
      const account = await findOrCreateAccount(pool, "0xranknegative");
      await awardRankPoints(pool, account.id, "loss");
      await awardRankPoints(pool, account.id, "loss");
      const status = await getMyRank(pool, account.id);
      expect(status.points).toBe(0);
      expect(status.tier.name).toBe("Bronze");
    });

    it("reaches the top tier and reports no next tier", async () => {
      const account = await findOrCreateAccount(pool, "0xranktop");
      const topTier = RANK_TIERS[RANK_TIERS.length - 1];
      for (let i = 0; i < Math.ceil(topTier.minPoints / 20); i++) await awardRankPoints(pool, account.id, "win");
      const status = await getMyRank(pool, account.id);
      expect(status.tier.name).toBe(topTier.name);
      expect(status.nextTier).toBeNull();
      expect(status.pointsToNextTier).toBeNull();
    });

    it("ranks accounts on the public board by points, and omits an account with no ranked history", async () => {
      const a = await findOrCreateAccount(pool, "0xrankboarda");
      const b = await findOrCreateAccount(pool, "0xrankboardb");
      const c = await findOrCreateAccount(pool, "0xrankboardc");
      await awardRankPoints(pool, a.id, "win");
      await awardRankPoints(pool, a.id, "win");
      await awardRankPoints(pool, b.id, "win");
      // c never plays a ranked match — should never appear on this board.

      const top = await getTopRank(pool);
      const aEntry = top.find((e) => e.walletAddress === "0xrankboarda");
      const bEntry = top.find((e) => e.walletAddress === "0xrankboardb");
      expect(aEntry?.points).toBe(40);
      expect(bEntry?.points).toBe(20);
      expect(aEntry!.rank).toBeLessThan(bEntry!.rank);
      expect(top.some((e) => e.walletAddress === "0xrankboardc")).toBe(false);

      const cStatus = await getMyRank(pool, c.id);
      expect(cStatus.rank).toBeNull();
      expect(cStatus.points).toBe(0);
    });
  });

  describe("events", () => {
    it("returns null when no event is active", async () => {
      expect(await getActiveEvent(pool)).toBeNull();
    });

    it("upserts and reports an event active right now", async () => {
      // Session 20: coinMultiplier no longer has anywhere to apply — match rewards were its only
      // hook point, and those were removed (see coinsRepo.ts's awardMatchResult doc comment).
      // Retarget this at a different Coins source if events ever get built out for real.
      const now = new Date();
      const start = new Date(now.getTime() - 60_000).toISOString();
      const end = new Date(now.getTime() + 60_000).toISOString();
      await upsertEvent(pool, {
        id: "test_double_coins",
        name: "Test Double Coins",
        description: "A test event.",
        coinMultiplier: 2,
        startsAt: start,
        endsAt: end,
      });

      const active = await getActiveEvent(pool);
      expect(active?.id).toBe("test_double_coins");
      expect(active?.coinMultiplier).toBe(2);
    });

    it("ignores an event outside its date range", async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 120_000).toISOString();
      const end = new Date(now.getTime() - 60_000).toISOString(); // ended a minute ago
      await upsertEvent(pool, {
        id: "test_expired",
        name: "Test Expired",
        description: "Already over.",
        coinMultiplier: 3,
        startsAt: start,
        endsAt: end,
      });
      expect(await getActiveEvent(pool)).toBeNull();
    });

    it("deleteEvent removes a row and getActiveEvent stops reporting it", async () => {
      const now = new Date();
      await upsertEvent(pool, {
        id: "test_delete_me",
        name: "Delete Me",
        description: "Should go away.",
        coinMultiplier: 2,
        startsAt: new Date(now.getTime() - 1000).toISOString(),
        endsAt: new Date(now.getTime() + 60_000).toISOString(),
      });
      expect((await getActiveEvent(pool))?.id).toBe("test_delete_me");
      expect(await deleteEvent(pool, "test_delete_me")).toBe(true);
      expect(await getActiveEvent(pool)).toBeNull();
      expect(await deleteEvent(pool, "test_delete_me")).toBe(false); // already gone
    });
  });
});

/** Test-only mirror of weeklyRepo.ts's private isoWeekOf — same ISO-8601 week algorithm, needed
 * here to compute a legal "last week"/"two weeks ago" string for the streak-gap tests above. */
function isoWeekOfForTest(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
