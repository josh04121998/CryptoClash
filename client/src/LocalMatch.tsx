import { useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { MatchView } from "./components/MatchView.js";
import { MuteToggle } from "./components/MuteToggle.js";
import { useMatch } from "./useMatch.js";

export interface LocalMatchProps {
  deckCards: string[];
  onExit: () => void;
}

type PendingConfirm = { title: string; action: "restart" | "exit" } | null;

export function LocalMatch({ deckCards, onExit }: LocalMatchProps) {
  const { state, dispatch, restart, lastError } = useMatch(deckCards);
  const [logOpen, setLogOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  // A real playtest flag: a stray click near the header silently discarded an in-progress
  // match with no confirmation, losing 5+ turns of play. Once the match already has a
  // winner there's nothing left to lose, so skip the prompt and act immediately —
  // matches TutorialMatch.tsx's existing confirm-before-leave pattern otherwise.
  function requestExit() {
    if (state.winner) onExit();
    else setPendingConfirm({ title: "Leave this match?", action: "exit" });
  }
  function requestRestart() {
    if (state.winner) restart();
    else setPendingConfirm({ title: "Start a new match?", action: "restart" });
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>FLOORWARS</h1>
        <span className="app-bar__subtitle">practice — vs. bot</span>
        <div className="app-bar__actions">
          <MuteToggle />
          <button type="button" onClick={() => setLogOpen((o) => !o)}>
            Log
          </button>
          <button type="button" onClick={requestRestart}>
            New Match
          </button>
          <button type="button" onClick={requestExit}>
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

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          body="Your progress in this match will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => {
            const action = pendingConfirm.action;
            setPendingConfirm(null);
            if (action === "restart") restart();
            else onExit();
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
