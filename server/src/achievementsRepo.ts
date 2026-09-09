import type { Pool, PoolClient } from "pg";
import { applyCoinDeltaOnClient } from "./ledger.js";

export class UnknownAchievementError extends Error {}
export class AchievementNotCompleteError extends Error {}
export class AchievementAlreadyClaimedError extends Error {}

/**
 * Any real, server-validated event this system tracks — the same bar Coins/quests already hold
 * (matchRoom.ts, packsRepo.ts, craftingRepo.ts — never a client-reported outcome). See each
 * def's track below for exactly where it's recorded.
 */
export type AchievementTrack = "win_total" | "pack_opened_total" | "craft_legendary" | "win_streak";

/**
 * "increment" adds a value to progress, capped at goal (same shape as questsRepo.ts's
 * recordQuestProgress). "max" instead keeps the greatest value ever reported — the win-streak
 * achievement wants "best streak ever reached," not a running sum, so a broken streak doesn't
 * erase the record.
 */
type AchievementMode = "increment" | "max";

export interface AchievementDef {
  id: string;
  description: string;
  goal: number;
  rewardCoins: number;
  track: AchievementTrack;
  mode: AchievementMode;
}

/**
 * Fixed, code-defined list (spec.md Section 21's "Achievements") — one-time/permanent, unlike
 * quest_progress's daily reset (questsRepo.ts). Hooks into the exact same real events
 * Coins/quests already validate server-side rather than inventing new tracking infrastructure:
 * match results (matchRoom.ts's recordMatchOutcomeForAchievements below), a pack grant
 * (packsRepo.ts's rollGrantAndLog — covers both paid opens and free referral/promo grants, since
 * that's the one shared path both go through), and a Legendary craft (craftingRepo.ts's
 * craftCard). First-pass goals/rewards, not tuned — same caveat as QUEST_DEFS.
 */
export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "win_10", description: "Win 10 matches", goal: 10, rewardCoins: 300, track: "win_total", mode: "increment" },
  { id: "win_50", description: "Win 50 matches", goal: 50, rewardCoins: 1000, track: "win_total", mode: "increment" },
  { id: "packs_25", description: "Open 25 packs", goal: 25, rewardCoins: 500, track: "pack_opened_total", mode: "increment" },
  {
    id: "craft_legendary",
    description: "Craft your first Legendary",
    goal: 1,
    rewardCoins: 400,
    track: "craft_legendary",
    mode: "increment",
  },
  { id: "win_streak_5", description: "Reach a 5-game win streak", goal: 5, rewardCoins: 600, track: "win_streak", mode: "max" },
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENT_DEFS.map((a) => [a.id, a]));

export interface AchievementStatus extends AchievementDef {
  progress: number;
  claimed: boolean;
}

export async function getMyAchievements(pool: Pool, accountId: string): Promise<AchievementStatus[]> {
  const result = await pool.query<{ achievement_id: string; progress: number; claimed: boolean }>(
    "select achievement_id, progress, claimed from achievement_progress where account_id = $1",
    [accountId],
  );
  const byId = new Map(result.rows.map((r) => [r.achievement_id, r]));
  return ACHIEVEMENT_DEFS.map((def) => {
    const row = byId.get(def.id);
    return { ...def, progress: row?.progress ?? 0, claimed: row?.claimed ?? false };
  });
}

/**
 * Bumps every achievement on `track` — "increment" mode adds `value` (capped at goal, same
 * upsert shape as questsRepo.ts's recordQuestProgress); "max" mode instead keeps the greatest
 * `value` ever reported. Accepts a bare Pool (matchRoom.ts's best-effort, non-transactional
 * calls) or a PoolClient already inside a transaction (packsRepo.ts/craftingRepo.ts, so an
 * achievement unlock composes into the same atomic pack-open/craft as everything else it does).
 */
export async function recordAchievementProgress(
  client: Pool | PoolClient,
  accountId: string,
  track: AchievementTrack,
  value = 1,
): Promise<void> {
  for (const def of ACHIEVEMENT_DEFS) {
    if (def.track !== track) continue;
    // Explicit ::int casts: `least($3, $4)` with no typed anchor on either side left Postgres to
    // infer both bare params as `text` (its default fallback when a function overload can't
    // resolve from context alone), throwing "progress is of type integer but expression is of
    // type text" — questsRepo.ts's recordQuestProgress dodges this by anchoring one LEAST operand
    // to an already-integer column (`quest_progress.progress + 1`); this query has no such
    // anchor on the INSERT side, so it needs the casts explicitly instead.
    if (def.mode === "increment") {
      await client.query(
        `insert into achievement_progress (account_id, achievement_id, progress, updated_at)
         values ($1, $2, least($3::int, $4::int), now())
         on conflict (account_id, achievement_id)
         do update set progress = least(achievement_progress.progress + $3::int, $4::int), updated_at = now()`,
        [accountId, def.id, value, def.goal],
      );
    } else {
      await client.query(
        `insert into achievement_progress (account_id, achievement_id, progress, updated_at)
         values ($1, $2, least($3::int, $4::int), now())
         on conflict (account_id, achievement_id)
         do update set progress = greatest(achievement_progress.progress, least($3::int, $4::int)), updated_at = now()`,
        [accountId, def.id, value, def.goal],
      );
    }
  }
}

export type MatchOutcomeForAchievements = "win" | "loss" | "draw";

/**
 * Called once per completed Play Online match, per participant with a real account
 * (matchRoom.ts) — advances "win_total" on a win, and maintains
 * accounts.current_win_streak (incremented on a win, reset to 0 on a loss/draw), which feeds
 * the "win_streak" achievement as a running max. Best-effort, same posture as
 * recordQuestProgress — a tracking failure here should never crash a match.
 */
export async function recordMatchOutcomeForAchievements(
  pool: Pool,
  accountId: string,
  outcome: MatchOutcomeForAchievements,
): Promise<void> {
  if (outcome === "win") {
    const result = await pool.query<{ current_win_streak: number }>(
      "update accounts set current_win_streak = current_win_streak + 1 where id = $1 returning current_win_streak",
      [accountId],
    );
    const streak = result.rows[0]?.current_win_streak ?? 1;
    await recordAchievementProgress(pool, accountId, "win_total", 1);
    await recordAchievementProgress(pool, accountId, "win_streak", streak);
  } else {
    await pool.query("update accounts set current_win_streak = 0 where id = $1", [accountId]);
  }
}

export interface AchievementClaimResult {
  coinsEarned: number;
  balance: number;
}

/**
 * Atomically flips `claimed` from false to true only if progress already meets the goal (the
 * `update ... where ... returning` is the whole compare-and-set, same as questsRepo.ts's
 * claimQuest), then credits Coins.
 */
export async function claimAchievement(pool: Pool, accountId: string, achievementId: string): Promise<AchievementClaimResult> {
  const def = ACHIEVEMENT_BY_ID.get(achievementId);
  if (!def) throw new UnknownAchievementError(`Unknown achievement: ${achievementId}`);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const claimedRow = await client.query(
      `update achievement_progress set claimed = true, updated_at = now()
       where account_id = $1 and achievement_id = $2 and claimed = false and progress >= $3`,
      [accountId, achievementId, def.goal],
    );
    if (claimedRow.rowCount === 0) {
      const existing = await client.query<{ progress: number; claimed: boolean }>(
        "select progress, claimed from achievement_progress where account_id = $1 and achievement_id = $2",
        [accountId, achievementId],
      );
      const row = existing.rows[0];
      if (row?.claimed) throw new AchievementAlreadyClaimedError(`Already claimed "${def.description}".`);
      throw new AchievementNotCompleteError(`"${def.description}" isn't complete yet (${row?.progress ?? 0}/${def.goal}).`);
    }

    const balance = await applyCoinDeltaOnClient(client, accountId, def.rewardCoins, `achievement:${achievementId}`);
    await client.query("commit");
    return { coinsEarned: def.rewardCoins, balance };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
