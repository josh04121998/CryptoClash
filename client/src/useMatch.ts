import { Intent, MatchState, SAMPLE_DECK, applyIntent, createMatch, takeBotTurn } from "@cryptoclash/engine";
import { useCallback, useEffect, useRef, useState } from "react";

const BOT_DELAY_MS = 700;

/**
 * Holds a MatchState (the engine mutates in place) plus a version counter to
 * force React re-renders. This is a local stand-in for what a real match
 * server would push over the network — the UI never touches engine logic
 * directly, only `dispatch`.
 */
export function useMatch() {
  const stateRef = useRef<MatchState>(createMatch(SAMPLE_DECK, SAMPLE_DECK, Date.now()));
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const dispatch = useCallback((intent: Intent) => {
    try {
      applyIntent(stateRef.current, intent);
      setLastError(null);
    } catch (e) {
      setLastError((e as Error).message);
    }
    setVersion((v) => v + 1);
  }, []);

  const restart = useCallback(() => {
    stateRef.current = createMatch(SAMPLE_DECK, SAMPLE_DECK, Date.now());
    setLastError(null);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (state.winner || state.activePlayer !== "B") return;
    const timer = setTimeout(() => {
      takeBotTurn(stateRef.current, "B");
      setVersion((v) => v + 1);
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [version]);

  return { state: stateRef.current, version, dispatch, restart, lastError };
}
