import type { IncomingMessage, ServerResponse } from "node:http";
import { Faction, validateDeck } from "@cryptoclash/engine";
import { isValidAnonId, TELEMETRY_MAX_BATCH_SIZE, type TelemetryEvent } from "@cryptoclash/protocol";
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
import {
  getCollectionSummary,
  getStartingFaction,
  grantStartingCollection,
  InvalidFactionError,
  StartingFactionAlreadySetError,
  setStartingFaction,
  validateOwnership,
} from "./collectionRepo.js";
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
import { insertTelemetryEvents, validateTelemetryEvent } from "./telemetryRepo.js";
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

// Every real JSON body this API receives is tiny (SIWE messages, 30-card-id deck lists, template
// ids) — a much larger body is either a mistake or an attempt to exhaust memory in this single
// long-lived process that also holds all live match state (see matchRoom.ts/createMatchServer.ts).
const MAX_JSON_BODY_BYTES = 1_000_000; // 1MB

class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body too large.");
    this.name = "PayloadTooLargeError";
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    // Throwing here (rather than reading to the end and rejecting after) stops the for-await loop,
    // which destroys the underlying request stream and its socket read side immediately — we never
    // buffer past the cap. Node still lets us write a normal response on `res` afterward (verified:
    // the client receives the 413 below rather than a bare connection reset).
    if (total > MAX_JSON_BODY_BYTES) throw new PayloadTooLargeError();
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

/**
 * Minimal in-memory per-IP rate limiter — same "single Railway process" reasoning as auth.ts's
 * pendingNonces store (no Redis/library needed for one process). Fixed-window: at most `max`
 * requests per `windowMs` per IP, tracked per named bucket so e.g. nonce-issuance and verify can
 * have independent budgets. Buckets are swept lazily (on each check) rather than on a timer, since
 * this map only ever holds as many entries as there are distinct IPs hitting these routes.
 */
const rateLimitBuckets = new Map<string, Map<string, { count: number; resetAt: number }>>();

function checkRateLimit(bucketName: string, key: string, max: number, windowMs: number): boolean {
  // vitest sets NODE_ENV=test automatically; the integration suites sign in far faster than any
  // real user would (many accounts in quick succession from one IP), which isn't the abuse pattern
  // this limiter exists for. Real deployments (Railway) never set NODE_ENV=test.
  if (process.env.NODE_ENV === "test") return true;
  let bucket = rateLimitBuckets.get(bucketName);
  if (!bucket) {
    bucket = new Map();
    rateLimitBuckets.set(bucketName, bucket);
  }
  const now = Date.now();
  const entry = bucket.get(key);
  if (!entry || entry.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

/** Railway proxies requests, so prefer the first (client-supplied-but-nearest-hop) x-forwarded-for
 * entry over the socket address, which would otherwise just be the proxy for every request. */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const ip = first?.trim();
  return ip || req.socket.remoteAddress || "unknown";
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
      // Nonce issuance and verify are the only unauthenticated routes that do real work (crypto
      // signature checks / DB writes) — worth a floor against a single IP hammering sign-in.
      if (!checkRateLimit("auth-nonce", getClientIp(req), 30, 60_000)) {
        sendJson(res, 429, { error: "Too many requests. Please try again shortly." });
        return true;
      }
      sendJson(res, 200, { nonce: issueNonce() });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/verify") {
      if (!checkRateLimit("auth-verify", getClientIp(req), 20, 60_000)) {
        sendJson(res, 429, { error: "Too many requests. Please try again shortly." });
        return true;
      }
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
      // Starting faction is now a one-time player choice (STATUS.md roadmap item 1), not an
      // automatic every-faction grant — only top up an *already-chosen* faction's Commons here.
      // A brand-new account (or one that signed in before this feature existed and never picked)
      // gets nothing granted on this path; the client offers the faction picker separately.
      const startingFaction = await getStartingFaction(pool, account.id);
      if (startingFaction) await grantStartingCollection(pool, account.id, startingFaction);
      if (account.isNew) {
        await grantWelcomeBonus(pool, account.id);
        // Best-effort — an unknown/garbled ?ref= code shouldn't block sign-in. Never applies to
        // an existing account (isNew-gated), same idempotency shape as the welcome bonus above.
        if (body.referralCode) await recordReferralSignup(pool, account.id, body.referralCode).catch(() => null);
      }
      const token = await issueSessionToken({ accountId: account.id, walletAddress: account.walletAddress });
      sendJson(res, 200, { token, account: { id: account.id, walletAddress: account.walletAddress, startingFaction } });
      return true;
    }

    if (url.pathname === "/api/account" && req.method === "GET") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      sendJson(res, 200, { startingFaction: await getStartingFaction(pool, accountId) });
      return true;
    }

    if (url.pathname === "/api/starting-faction" && req.method === "POST") {
      const accountId = await requireAccount(req);
      if (!accountId) {
        sendJson(res, 401, { error: "Not authenticated." });
        return true;
      }
      const body = (await readJsonBody(req)) as { faction?: string };
      if (!body.faction) {
        sendJson(res, 400, { error: "faction is required." });
        return true;
      }
      try {
        await setStartingFaction(pool, accountId, body.faction as Faction);
        sendJson(res, 200, { startingFaction: body.faction });
      } catch (e) {
        if (e instanceof InvalidFactionError) {
          sendJson(res, 400, { error: e.message });
        } else if (e instanceof StartingFactionAlreadySetError) {
          sendJson(res, 409, { error: e.message });
        } else {
          throw e;
        }
      }
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

    // Product telemetry ingest (session 33) — see telemetryRepo.ts. Nothing to do with
    // /api/events/* above, which is the live-ops Coins-multiplier feature; this is the
    // client-side funnel/analytics firehose.
    if (url.pathname === "/api/telemetry" && req.method === "POST") {
      // Far higher volume than the auth routes (a client flushes a batch every few seconds
      // while the tab is open), so a 30/min auth-shaped budget would reject real traffic. 120
      // batches/min per IP is ~2/s — many times what one honest tab produces, still a hard
      // ceiling of 120 x 50 = 6,000 events/min from a single IP, and forgiving of the
      // several-players-behind-one-NAT case that a per-IP limiter can't distinguish from abuse.
      // NODE_ENV=test bypasses this inside checkRateLimit, same as the auth routes.
      if (!checkRateLimit("telemetry", getClientIp(req), 120, 60_000)) {
        sendJson(res, 429, { error: "Too many requests. Please try again shortly." });
        return true;
      }
      const body = (await readJsonBody(req)) as { anonId?: unknown; events?: unknown };
      if (!isValidAnonId(body.anonId)) {
        sendJson(res, 400, { error: "anonId is required and must be 16-64 characters of [a-z0-9]." });
        return true;
      }
      if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > TELEMETRY_MAX_BATCH_SIZE) {
        sendJson(res, 400, { error: `events must be an array of 1 to ${TELEMETRY_MAX_BATCH_SIZE} entries.` });
        return true;
      }
      // Optional auth, same soft posture as the /api/leaderboard/* routes: a missing or invalid
      // token just means anonymous attribution rather than a 401. Most of the funnel this table
      // exists to measure happens before a wallet is ever connected. The client never sends an
      // account id — it's resolved here, from the token, or it's null.
      const accountId = await requireAccount(req);
      // Individually-invalid events (unknown name, unusable ts, illegal props) are dropped
      // silently and the rest of the batch still lands — and the response is a 202 either way,
      // so this never leaks which names are on the allowlist.
      const events = body.events
        .map(validateTelemetryEvent)
        .filter((event): event is TelemetryEvent => event !== null);
      let accepted = 0;
      try {
        accepted = await insertTelemetryEvents(pool, { anonId: body.anonId, accountId, events });
      } catch (e) {
        // Best-effort by contract: a telemetry write failing must never surface as an error to
        // a player. Logged (the only signal this path has) and reported as 0 accepted.
        console.error("[telemetry] insert failed:", (e as Error).message);
      }
      sendJson(res, 202, { accepted });
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
    if (e instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: e.message });
      return true;
    }
    sendJson(res, 500, { error: (e as Error).message });
    return true;
  }
}
