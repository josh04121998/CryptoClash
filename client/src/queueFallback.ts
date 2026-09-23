/**
 * When Play Online should stop waiting and hand the player a bot match instead.
 *
 * Matchmaking is strictly FIFO (`server/src/createMatchServer.ts` — `queue.shift()`
 * and nothing else), so two humans have to be queued at the same instant to meet.
 * Below critical mass that essentially never happens, which made the headline
 * multiplayer mode a dead end for an arriving player: wait, get nothing, back out.
 *
 * The fallback is deliberately *disclosed*, never disguised as a human — a
 * practice match that awards nothing is honest; a fake "opponent" is not. It also
 * fires only once per visit to the queue: if the player explicitly chooses to go
 * back and wait for a real opponent, that choice is respected rather than
 * overridden 20 seconds later.
 */

/** Waiting longer than this with nobody queued hands the player a bot match. */
export const BOT_FALLBACK_SECONDS = 20;

/** When to warn that the fallback is coming, so it never arrives unannounced. */
export const QUEUE_HINT_SECONDS = 12;

export interface QueueFallbackInput {
  /** useOnlineMatch's connection status. */
  status: string;
  /** Seconds spent in the current queue wait. */
  queuedSeconds: number;
  /** True once the player has chosen "wait for a real opponent" — suppresses the automatic fallback from then on. */
  waitingByChoice: boolean;
}

/** Whether the queue has waited long enough to give up and start a bot match. */
export function shouldFallBackToBot({ status, queuedSeconds, waitingByChoice }: QueueFallbackInput): boolean {
  if (status !== "queued") return false;
  if (waitingByChoice) return false;
  return queuedSeconds >= BOT_FALLBACK_SECONDS;
}

/** Whether to show the "no one's here, we'll start you against the bot" warning. */
export function shouldShowQueueHint({ status, queuedSeconds, waitingByChoice }: QueueFallbackInput): boolean {
  if (status !== "queued") return false;
  return queuedSeconds >= (waitingByChoice ? BOT_FALLBACK_SECONDS : QUEUE_HINT_SECONDS);
}
