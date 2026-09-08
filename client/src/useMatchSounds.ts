import { MatchState, PlayerId } from "@cryptoclash/engine";
import { useEffect, useRef, useState } from "react";
import {
  playAttackSound,
  playCardSound,
  playDeathSound,
  playDrawSound,
  playHealSound,
  playLoseSound,
  playMarketEventSound,
  playWinSound,
  playYourTurnSound,
} from "./sound.js";

/**
 * Derives sound effects purely from diffing successive MatchState snapshots
 * against the previous one — no engine changes needed. `state.log` entries
 * are free-form text (engine/src/types.ts's LogEntry), not typed events, so
 * this pattern-matches on the handful of stable phrasings pushLog() actually
 * uses (matchOps.ts/combat.ts/effects.ts/marketEvents.ts) rather than
 * requiring a structured event system. A worst-case wording drift just means
 * a sound silently doesn't fire — never a crash, since this only reads text.
 * Same "diff against a ref, one-shot per real transition" shape as
 * CardFace.tsx/PlayerHeader.tsx's justHit.
 *
 * Also returns `marketEventFlash`, a counter that increments once per
 * detected Market Event log line — MatchView watches it (the same one-shot
 * ref-diff pattern again) to trigger a brief full-table screen flash,
 * matching the sound with a visual beat for what's meant to be a dramatic,
 * game-swinging moment (batlleSpec.md Sections 16-18).
 */
export function useMatchSounds(state: MatchState, myPlayerId: PlayerId) {
  const prevLogLengthRef = useRef(0);
  const prevWinnerRef = useRef<MatchState["winner"]>(null);
  const prevActivePlayerRef = useRef<PlayerId | null>(null);
  const mountedRef = useRef(false);
  const [marketEventFlash, setMarketEventFlash] = useState(0);

  useEffect(() => {
    const isFirstRun = !mountedRef.current;
    mountedRef.current = true;

    if (!isFirstRun) {
      for (let i = prevLogLengthRef.current; i < state.log.length; i++) {
        const text = state.log[i].text;
        if (/MARKET CRASH|PUMP —|LIQUIDATION|FOMO —|BLACK SWAN/.test(text)) {
          playMarketEventSound();
          setMarketEventFlash((c) => c + 1);
        } else if (text.includes(" dies.")) playDeathSound();
        else if (text.includes(" heals ")) playHealSound();
        else if (text.includes(" attacks ") || text.includes(" trades with ")) playAttackSound();
        else if (text.includes(" plays ")) playCardSound();
      }
    }
    prevLogLengthRef.current = state.log.length;

    if (!isFirstRun && prevWinnerRef.current === null && state.winner !== null) {
      if (state.winner === "Draw") playDrawSound();
      else if (state.winner === myPlayerId) playWinSound();
      else playLoseSound();
    }
    prevWinnerRef.current = state.winner;

    if (!isFirstRun && !state.winner && prevActivePlayerRef.current !== null && prevActivePlayerRef.current !== myPlayerId && state.activePlayer === myPlayerId) {
      playYourTurnSound();
    }
    prevActivePlayerRef.current = state.activePlayer;
  }, [state, myPlayerId]);

  return { marketEventFlash };
}
