import type { Pool } from "pg";
import { applyCoinDeltaOnClient } from "./ledger.js";
import { withTransaction } from "./txHelper.js";

export class UnknownQuestError extends Error {}
export class QuestNotCompleteError extends Error {}
export class QuestAlreadyClaimedError extends Error {}

/** What kind of match event advances a quest — matchRoom.ts reports one of these per participant, per completed Play Online match. */
export type QuestTrack = "play" | "win";

export interface QuestDef {
  id: string;
  description: string;
  goal: number;
  rewardCoins: number;
  track: QuestTrack;
}

/**
 * Fixed, code-defined quest list (spec.md Section 21's "Quests" / "Daily
 * rewards" — this is the Quests half, dailyRepo.ts is the daily-login half).
 * Reset daily (see `day` below) — everyone gets the same three quests each
 * day, no per-account variety yet. Only Play Online advances these (see
 * matchRoom.ts) — Play vs AI has no server-validated outcome, same reasoning
 * it's excluded from Coins match rewards (coinsRepo.ts). First-pass reward
 * numbers, not tuned.
 */
export const QUEST_DEFS: QuestDef[] = [
  { id: "play_1", description: "Play 1 match", goal: 1, rewardCoins: 50, track: "play" },
  { id: "play_3", description: "Play 3 matches", goal: 3, rewardCoins: 150, track: "play" },
  { id: "win_1", description: "Win 1 match", goal: 1, rewardCoins: 100, track: "win" },
];

const QUEST_BY_ID = new Map(QUEST_DEFS.map((q) => [q.id, q]));

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuestStatus extends QuestDef {
  progress: number;
  claimed: boolean;
}

export async function getTodayQuests(pool: Pool, accountId: string): Promise<QuestStatus[]> {
  const day = todayUtc();
  const result = await pool.query<{ quest_id: string; progress: number; claimed: boolean }>(
    "select quest_id, progress, claimed from quest_progress where account_id = $1 and day = $2",
    [accountId, day],
  );
  const byId = new Map(result.rows.map((r) => [r.quest_id, r]));
  return QUEST_DEFS.map((def) => {
    const row = byId.get(def.id);
    return { ...def, progress: row?.progress ?? 0, claimed: row?.claimed ?? false };
  });
}

/**
 * Bumps every quest on `track` by one step for today, capped at each quest's
 * goal — called once per participant per completed Play Online match (see
 * matchRoom.ts), "play" always and "win" only for the winner. The upsert is
 * the whole operation; no row lock needed beyond what `on conflict` already
 * gives, since each account's progress row is only ever written by its own
 * match completions (never concurrently for the *same* match, since a match
 * only finishes once).
 */
export async function recordQuestProgress(pool: Pool, accountId: string, track: QuestTrack): Promise<void> {
  const day = todayUtc();
  for (const def of QUEST_DEFS) {
    if (def.track !== track) continue;
    await pool.query(
      `insert into quest_progress (account_id, quest_id, day, progress, updated_at)
       values ($1, $2, $3, 1, now())
       on conflict (account_id, quest_id, day)
       do update set progress = least(quest_progress.progress + 1, $4), updated_at = now()`,
      [accountId, def.id, day, def.goal],
    );
  }
}

export interface QuestClaimResult {
  coinsEarned: number;
  balance: number;
}

/**
 * Atomically flips `claimed` from false to true only if progress already
 * meets the goal (the `update ... where ... returning` is the whole
 * compare-and-set — no separate lock needed), then credits Coins. A quest
 * that doesn't exist, isn't complete, or is already claimed throws instead of
 * silently no-opping, so the client can show a real reason.
 */
export async function claimQuest(pool: Pool, accountId: string, questId: string): Promise<QuestClaimResult> {
  const def = QUEST_BY_ID.get(questId);
  if (!def) throw new UnknownQuestError(`Unknown quest: ${questId}`);
  const day = todayUtc();

  return withTransaction(pool, async (client) => {
    const claimedRow = await client.query(
      `update quest_progress set claimed = true, updated_at = now()
       where account_id = $1 and quest_id = $2 and day = $3 and claimed = false and progress >= $4`,
      [accountId, questId, day, def.goal],
    );
    if (claimedRow.rowCount === 0) {
      const existing = await client.query<{ progress: number; claimed: boolean }>(
        "select progress, claimed from quest_progress where account_id = $1 and quest_id = $2 and day = $3",
        [accountId, questId, day],
      );
      const row = existing.rows[0];
      if (row?.claimed) throw new QuestAlreadyClaimedError(`Already claimed "${def.description}" today.`);
      throw new QuestNotCompleteError(`"${def.description}" isn't complete yet (${row?.progress ?? 0}/${def.goal}).`);
    }

    const balance = await applyCoinDeltaOnClient(client, accountId, def.rewardCoins, `quest:${questId}`);
    return { coinsEarned: def.rewardCoins, balance };
  });
}
