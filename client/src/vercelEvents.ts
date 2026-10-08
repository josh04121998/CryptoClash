import { track } from "@vercel/analytics";

/**
 * Vercel's own project dashboard shows visitor counts but, until now, no
 * game-specific signal next to them — "how many people showed up" with no
 * "and did anything happen." This surfaces real match completions there too,
 * via Vercel's own custom-event tracking (separate from telemetry.ts's
 * allowlisted pipeline into our own Postgres, which still powers `npm run
 * report`). Same "must never break the game" posture as that module.
 */
export function trackMatchCompleteOnVercel(mode: string, result: string, turns: number): void {
  try {
    track("match_complete", { mode, result, turns });
  } catch {
    /* must never break the game */
  }
}
