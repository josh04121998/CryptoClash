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
 * game-swinging moment (batlleSpec.md Sections 16-18). `marketEventText`
 * rides alongside it — the actual matched log line(s) (BLACK_SWAN fires two:
 * its own header plus whichever event it randomly picked), so MatchView can
 * show a real readable toast naming what just happened instead of leaving
 * the player to open the Log to find out (a real gap: the flash alone told
 * you *something* happened, never *what*).
 *
 * The effect deliberately depends on primitives read off `state`
 * (`log.length`/`winner`/`activePlayer`), not `state` itself — `useMatch.ts`
 * (Play vs AI) mutates its MatchState in place and re-renders via an
 * unrelated version counter, so the object reference never changes; an
 * effect keyed on the whole object would only ever run once, on mount.
 * `useOnlineMatch.ts` does hand back a fresh object every server message, so
 * this works for both, but only the primitive-keyed form is safe for both.
 */
export function useMatchSounds(state: MatchState, myPlayerId: PlayerId) {
  const prevLogLengthRef = useRef(0);
  const prevWinnerRef = useRef<MatchState["winner"]>(null);
  const prevActivePlayerRef = useRef<PlayerId | null>(null);
  const mountedRef = useRef(false);
  const [marketEventFlash, setMarketEventFlash] = useState(0);
  const [marketEventText, setMarketEventText] = useState<string | null>(null);

  useEffect(() => {
    const isFirstRun = !mountedRef.current;
    mountedRef.current = true;

    if (!isFirstRun) {
      const firedLines: string[] = [];
      for (let i = prevLogLengthRef.current; i < state.log.length; i++) {
        const text = state.log[i].text;
        if (/MARKET CRASH|PUMP —|LIQUIDATION|FOMO —|BLACK SWAN/.test(text)) {
          playMarketEventSound();
          firedLines.push(text);
        } else if (text.includes(" dies.")) playDeathSound();
        else if (text.includes(" heals ")) playHealSound();
        else if (text.includes(" attacks ") || text.includes(" trades with ")) playAttackSound();
        else if (text.includes(" plays ")) playCardSound();
      }
      if (firedLines.length > 0) {
        setMarketEventFlash((c) => c + 1);
        setMarketEventText(firedLines.join(" "));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log.length, state.winner, state.activePlayer, myPlayerId]);

  return { marketEventFlash, marketEventText };
}
