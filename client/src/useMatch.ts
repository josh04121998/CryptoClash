import { DECKS, DEFAULT_DECK_ID, Intent, MatchState, applyIntent, createMatch, getDeck, takeBotTurn } from "@cryptoclash/engine";
import { useCallback, useEffect, useRef, useState } from "react";

const BOT_DELAY_MS = 700;

/** The bot plays a randomly chosen pre-built deck each match, for variety. */
function randomDeck(): string[] {
  return DECKS[Math.floor(Math.random() * DECKS.length)].cards;
}

/**
 * Holds a MatchState (the engine mutates in place) plus a version counter to
 * force React re-renders. This is a local stand-in for what a real match
 * server would push over the network — the UI never touches engine logic
 * directly, only `dispatch`.
 */
export function useMatch(deckId: string = DEFAULT_DECK_ID) {
  const stateRef = useRef<MatchState>(createMatch(getDeck(deckId), randomDeck(), Date.now()));
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
    stateRef.current = createMatch(getDeck(deckId), randomDeck(), Date.now());
    setLastError(null);
    setVersion((v) => v + 1);
  }, [deckId]);

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
