import { useState } from "react";
import { MatchView } from "./components/MatchView.js";
import { useMatch } from "./useMatch.js";

export interface LocalMatchProps {
  deckCards: string[];
  onExit: () => void;
}

export function LocalMatch({ deckCards, onExit }: LocalMatchProps) {
  const { state, dispatch, restart, lastError } = useMatch(deckCards);
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">practice — vs. bot</span>
        <div className="app-bar__actions">
          <button type="button" onClick={() => setLogOpen((o) => !o)}>
            Log
          </button>
          <button type="button" onClick={restart}>
            New Match
          </button>
          <button type="button" onClick={onExit}>
            Menu
          </button>
        </div>
      </header>

      <MatchView
        state={state}
        myPlayerId="A"
        dispatch={dispatch}
        lastError={lastError}
        myLabel="You (A)"
        opponentLabel="Bot (B)"
        opponentTurnLabel="Bot is thinking…"
        logOpen={logOpen}
        onCloseLog={() => setLogOpen(false)}
      />
    </div>
  );
}
