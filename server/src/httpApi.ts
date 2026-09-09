import type { IncomingMessage, ServerResponse } from "node:http";
import { validateDeck } from "@cryptoclash/engine";
import type { Pool } from "pg";
import { findOrCreateAccount } from "./accounts.js";
import {
  AchievementAlreadyClaimedError,
  AchievementNotCompleteError,
  claimAchievement,
  getMyAchievements,
  UnknownAchievementError,
} from "./achievementsRepo.js";
import { issueNonce, issueSessionToken, verifySessionToken, verifySiwe } from "./auth.js";
import { getCollectionSummary, grantStartingCollection, validateOwnership } from "./collectionRepo.js";
import { getBalance, grantWelcomeBonus } from "./coinsRepo.js";
import {
  craftCard,
  disenchantCards,
  getCraftRates,
  getDustBalance,
  InsufficientCopiesError,
  InsufficientDustError,
  InvalidTemplateError,
} from "./craftingRepo.js";
import { AlreadyClaimedTodayError, claimDaily, getDailyStatus } from "./dailyRepo.js";
import { createDeck, deleteDeck, listDecks, updateDeck } from "./decksRepo.js";
import { deleteEvent, getActiveEvent, upsertEvent } from "./eventsRepo.js";
import { getMyCoinsEarned, getMyWinRate, getMyWins, getTopCoinsEarned, getTopWinRate, getTopWins } from "./leaderboardRepo.js";
import { InsufficientCoinsError, openPack, PACK_DEFINITIONS, UnknownPackTypeError } from "./packsRepo.js";
import { claimQuest, getTodayQuests, QuestAlreadyClaimedError, QuestNotCompleteError, UnknownQuestError } from "./questsRepo.js";
import { getMyRank, getTopRank } from "./rankRepo.js";
import { getReferralStats, recordReferralSignup } from "./referralsRepo.js";
import { AlreadyClaimedThisWeekError, claimWeekly, getWeeklyStatus } from "./weeklyRepo.js";

/** Same reasoning as createMatchServer's CLIENT_ORIGIN: reflect one configured origin, or allow all in dev. */
function corsHeaders(): Record<string, string> {
  const origin = process.env.CLIENT_ORIGIN ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...corsHeaders() });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

async function requireAccount(req: IncomingMessage): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const claims = await verifySessionToken(header.slice("Bearer ".length));
  return claims?.accountId ?? null;
}

/**
 * Handles every `/api/*` route; returns false for anything else so the
 * caller (createMatchServer.ts) can fall through to its existing plain-text
 * response. Kept as one function rather than a framework — this is 6 routes.
 */
export async function handleApiRequest(req: IncomingMessage, res: ServerResponse, pool: Pool): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://internal");
  if (!url.pathname.startsWith("/api/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return true;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/auth/nonce") {
      sendJson(res, 200, { nonce: issueNonce() });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/verify") {
      const body = (await readJsonBody(req)) as { message?: string; signature?: string; referralCode?: string };
      if (!body.message || !body.signature) {
        sendJson(res, 400, { error: "message and signature are required." });
        return true;
      }
      const expectedDomain = process.env.SIWE_DOMAIN;
      if (!expectedDomain) {
        sendJson(res, 500, { error: "Server misconfigured: SIWE_DOMAIN is not set." });
        return true;
      }
      const result = await verifySiwe(body.message, body.signature, expectedDomain);
      if (!result.ok) {
        sendJson(res, 401, { error: result.error });
        return true;
      }
      const account = await findOrCreateAccount(pool, result.address);
      await grantStartingCollection(pool, account.id);
      if (account.isNew) {
        await grantWelcomeBonus(pool, account.id);
        // Best-effort — an unknown/garbled ?ref= code shouldn't block sign-in. Never applies to
        // an existing account (isNew-gated), same idempotency shape as the welcome bonus above.
        if (body.referralCode) await recordReferralSignup(pool, account.id, body.referralCode).catch(() => null);
      }
      const token = await issueSessionToken({ accountId: account.id, walletAddress: account.walletAddress });
      sendJson(res, 200, { token, account: { id: account.id, walletAddress: account.walletAddress } });
      return true;
    }

    if (url.pathname === "/api/collection" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, await getCollectionSummary(pool, accountId));
      return true;
    }

    if (url.pathname === "/api/coins" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, { balance: await getBalance(pool, accountId) });
      return true;
    }

    if (url.pathname === "/api/packs" && req.method === "GET") {
      sendJson(res, 200, { packs: Object.values(PACK_DEFINITIONS) });
      return true;
    }

    if (url.pathname === "/api/packs/open" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const body = (await readJsonBody(req)) as { packType?: string };
      const packType = body.packType ?? "standard";
      try {
        const result = await openPack(pool, accountId, packType);
        sendJson(res, 200, result);
      } catch (e) {
        if (e instanceof InsufficientCoinsError) {
          sendJson(res, 402, { error: e.message });
        } else if (e instanceof UnknownPackTypeError) {
          sendJson(res, 400, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/craft/rates" && req.method === "GET") {
      sendJson(res, 200, { rates: getCraftRates() });
      return true;
    }

    if (url.pathname === "/api/dust" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, { balance: await getDustBalance(pool, accountId) });
      return true;
    }

    if (url.pathname === "/api/craft/disenchant" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const body = (await readJsonBody(req)) as { templateId?: string; count?: number };
      const { templateId, count } = body;
      if (!templateId || !Number.isInteger(count) || count! < 1) {
        sendJson(res, 400, { error: "templateId is required and count must be a positive integer." });
        return true;
      }
      try {
        const result = await disenchantCards(pool, accountId, templateId, count!);
        sendJson(res, 200, result);
      } catch (e) {
        if (e instanceof InvalidTemplateError) {
          sendJson(res, 400, { error: e.message });
        } else if (e instanceof InsufficientCopiesError) {
          sendJson(res, 409, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/craft/craft" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const body = (await readJsonBody(req)) as { templateId?: string };
      if (!body.templateId) {
        sendJson(res, 400, { error: "templateId is required." });
        return true;
      }
      try {
        const result = await craftCard(pool, accountId, body.templateId);
        sendJson(res, 200, result);
      } catch (e) {
        if (e instanceof InvalidTemplateError) {
          sendJson(res, 400, { error: e.message });
        } else if (e instanceof InsufficientDustError) {
          sendJson(res, 402, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/referral" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, await getReferralStats(pool, accountId));
      return true;
    }

    if (url.pathname === "/api/leaderboard/wins" && req.method === "GET") {
      // Public — viewing the leaderboard needs no wallet (same "no login wall to look" principle
      // as GET /api/packs); only "mine" needs identity, and that's soft — an absent/invalid token
      // just omits it rather than 401ing the whole request.
      const accountId = await requireAccount(req);
      const [entries, mine] = await Promise.all([getTopWins(pool), accountId ? getMyWins(pool, accountId) : null]);
      sendJson(res, 200, { entries, mine });
      return true;
    }

    if (url.pathname === "/api/leaderboard/win-rate" && req.method === "GET") {
      const accountId = await requireAccount(req);
      const [entries, mine] = await Promise.all([getTopWinRate(pool), accountId ? getMyWinRate(pool, accountId) : null]);
      sendJson(res, 200, { entries, mine });
      return true;
    }

    if (url.pathname === "/api/leaderboard/coins-earned" && req.method === "GET") {
      const accountId = await requireAccount(req);
      const [entries, mine] = await Promise.all([getTopCoinsEarned(pool), accountId ? getMyCoinsEarned(pool, accountId) : null]);
      sendJson(res, 200, { entries, mine });
      return true;
    }

    if (url.pathname === "/api/daily" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, await getDailyStatus(pool, accountId));
      return true;
    }

    if (url.pathname === "/api/daily/claim" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      try {
        sendJson(res, 200, await claimDaily(pool, accountId));
      } catch (e) {
        if (e instanceof AlreadyClaimedTodayError) {
          sendJson(res, 409, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/quests" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, { quests: await getTodayQuests(pool, accountId) });
      return true;
    }

    const questClaimMatch = url.pathname.match(/^\/api\/quests\/([^/]+)\/claim$/);
    if (questClaimMatch && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      try {
        sendJson(res, 200, await claimQuest(pool, accountId, questClaimMatch[1]));
      } catch (e) {
        if (e instanceof UnknownQuestError) {
          sendJson(res, 400, { error: e.message });
        } else if (e instanceof QuestNotCompleteError || e instanceof QuestAlreadyClaimedError) {
          sendJson(res, 409, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/weekly" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, await getWeeklyStatus(pool, accountId));
      return true;
    }

    if (url.pathname === "/api/weekly/claim" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      try {
        sendJson(res, 200, await claimWeekly(pool, accountId));
      } catch (e) {
        if (e instanceof AlreadyClaimedThisWeekError) {
          sendJson(res, 409, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/achievements" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, { achievements: await getMyAchievements(pool, accountId) });
      return true;
    }

    const achievementClaimMatch = url.pathname.match(/^\/api\/achievements\/([^/]+)\/claim$/);
    if (achievementClaimMatch && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      try {
        sendJson(res, 200, await claimAchievement(pool, accountId, achievementClaimMatch[1]));
      } catch (e) {
        if (e instanceof UnknownAchievementError) {
          sendJson(res, 400, { error: e.message });
        } else if (e instanceof AchievementNotCompleteError || e instanceof AchievementAlreadyClaimedError) {
          sendJson(res, 409, { error: e.message });
        } else {
          throw e;
        }
      }
      return true;
    }

    if (url.pathname === "/api/rank" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, await getMyRank(pool, accountId));
      return true;
    }

    if (url.pathname === "/api/leaderboard/rank" && req.method === "GET") {
      // Public, same "no login wall to look" posture as the other /api/leaderboard/* routes.
      const accountId = await requireAccount(req);
      const [entries, mine] = await Promise.all([getTopRank(pool), accountId ? getMyRank(pool, accountId) : null]);
      sendJson(res, 200, { entries, mine });
      return true;
    }

    if (url.pathname === "/api/events/active" && req.method === "GET") {
      // Public — seeing that a bonus is running needs no wallet, same as GET /api/packs.
      sendJson(res, 200, { event: await getActiveEvent(pool) });
      return true;
    }

    // Crude admin gate — see eventsRepo.ts's top comment. Disabled entirely (501) unless
    // ADMIN_SECRET is configured; when it is, the caller must echo it back in x-admin-secret.
    if (url.pathname === "/api/admin/events" && req.method === "POST") {
      const secret = process.env.ADMIN_SECRET;
      if (!secret) {
        sendJson(res, 501, { error: "Admin routes aren't configured (ADMIN_SECRET is not set)." });
        return true;
      }
      if (req.headers["x-admin-secret"] !== secret) {
        sendJson(res, 401, { error: "Invalid admin secret." });
        return true;
      }
      const body = (await readJsonBody(req)) as {
        id?: string;
        name?: string;
        description?: string;
        coinMultiplier?: number;
        startsAt?: string;
        endsAt?: string;
      };
      if (!body.id || !body.name || !body.description || !body.coinMultiplier || !body.startsAt || !body.endsAt) {
        sendJson(res, 400, { error: "id, name, description, coinMultiplier, startsAt, and endsAt are all required." });
        return true;
      }
      const event = await upsertEvent(pool, {
        id: body.id,
        name: body.name,
        description: body.description,
        coinMultiplier: body.coinMultiplier,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
      });
      sendJson(res, 200, { event });
      return true;
    }

    const adminEventIdMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/);
    if (adminEventIdMatch && req.method === "DELETE") {
      const secret = process.env.ADMIN_SECRET;
      if (!secret) {
        sendJson(res, 501, { error: "Admin routes aren't configured (ADMIN_SECRET is not set)." });
        return true;
      }
      if (req.headers["x-admin-secret"] !== secret) {
        sendJson(res, 401, { error: "Invalid admin secret." });
        return true;
      }
      const deleted = await deleteEvent(pool, adminEventIdMatch[1]);
      if (!deleted) {
        sendJson(res, 404, { error: "Event not found." });
        return true;
      }
      res.writeHead(204, corsHeaders());
      res.end();
      return true;
    }

    if (url.pathname === "/api/decks" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, { decks: await listDecks(pool, accountId) });
      return true;
    }

    if (url.pathname === "/api/decks" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const body = (await readJsonBody(req)) as { name?: string; cards?: string[] };
      if (!body.name || !Array.isArray(body.cards)) {
        sendJson(res, 400, { error: "name and cards[] are required." });
        return true;
      }
      const errors = validateDeck(body.cards).concat(await validateOwnership(pool, accountId, body.cards));
      if (errors.length > 0) {
        sendJson(res, 422, { error: "Illegal deck.", details: errors });
        return true;
      }
      sendJson(res, 201, { deck: await createDeck(pool, accountId, body.name, body.cards) });
      return true;
    }

    const deckIdMatch = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
    if (deckIdMatch && req.method === "PUT") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const body = (await readJsonBody(req)) as { name?: string; cards?: string[] };
      if (!body.name || !Array.isArray(body.cards)) {
        sendJson(res, 400, { error: "name and cards[] are required." });
        return true;
      }
      const errors = validateDeck(body.cards).concat(await validateOwnership(pool, accountId, body.cards));
      if (errors.length > 0) {
        sendJson(res, 422, { error: "Illegal deck.", details: errors });
        return true;
      }
      const deck = await updateDeck(pool, accountId, deckIdMatch[1], body.name, body.cards);
      if (!deck) {
        sendJson(res, 404, { error: "Deck not found." });
        return true;
      }
      sendJson(res, 200, { deck });
      return true;
    }

    if (deckIdMatch && req.method === "DELETE") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const deleted = await deleteDeck(pool, accountId, deckIdMatch[1]);
      if (!deleted) {
        sendJson(res, 404, { error: "Deck not found." });
        return true;
      }
      res.writeHead(204, corsHeaders());
      res.end();
      return true;
    }

    sendJson(res, 404, { error: "Not found." });
    return true;
  } catch (e) {
    sendJson(res, 500, { error: (e as Error).message });
    return true;
  }
}
