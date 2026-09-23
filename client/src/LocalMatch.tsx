import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { MatchView } from "./components/MatchView.js";
import { MuteToggle } from "./components/MuteToggle.js";
import { track } from "./telemetry.js";
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

  // Ref guards, not state: StrictMode double-invokes mount effects in dev, and
  // `state` is a mutated-in-place engine object, so the winner effect below can
  // re-run for reasons other than the winner actually changing.
  const startedRef = useRef(false);
  const endedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track("match_started", { mode: "ai" });
  }, []);

  useEffect(() => {
    if (!state.winner || endedRef.current) return;
    endedRef.current = true;
    track("match_ended", {
      mode: "ai",
      result: state.winner === "Draw" ? "draw" : state.winner === "A" ? "win" : "loss",
      turns: state.turnNumber,
    });
  }, [state.winner, state.turnNumber]);

  /** A match left with no winner is `abandoned` — same event, different result. */
  function trackAbandonIfUnfinished() {
    if (state.winner || endedRef.current) return;
    endedRef.current = true;
    track("match_ended", { mode: "ai", result: "abandoned", turns: state.turnNumber });
  }

  function exitMatch() {
    trackAbandonIfUnfinished();
    onExit();
  }

  function restartMatch() {
    trackAbandonIfUnfinished();
    endedRef.current = false;
    track("match_started", { mode: "ai" });
    restart();
  }

  // A real playtest flag: a stray click near the header silently discarded an in-progress
  // match with no confirmation, losing 5+ turns of play. Once the match already has a
  // winner there's nothing left to lose, so skip the prompt and act immediately —
  // matches TutorialMatch.tsx's existing confirm-before-leave pattern otherwise.
  function requestExit() {
    if (state.winner) exitMatch();
    else setPendingConfirm({ title: "Leave this match?", action: "exit" });
  }
  function requestRestart() {
    if (state.winner) restartMatch();
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
            if (action === "restart") restartMatch();
            else exitMatch();
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
