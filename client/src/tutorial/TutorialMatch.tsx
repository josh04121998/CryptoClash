import { useState } from "react";
import { MatchView } from "../components/MatchView.js";
import { MuteToggle } from "../components/MuteToggle.js";
import { markTutorialCompleted, markTutorialSkipped } from "../tutorialStorage.js";
import { coachFor, spotlightFor } from "./beats.js";
import { CoachCard } from "./CoachCard.js";
import { useTutorialMatch } from "./useTutorialMatch.js";

export interface TutorialMatchProps {
  onPracticeAi: () => void;
  onMainMenu: () => void;
}

export function TutorialMatch({ onPracticeAi, onMainMenu }: TutorialMatchProps) {
  const { state, dispatch, lastError, ctrl, ackPreMatch, skipTip } = useTutorialMatch();
  const [logOpen, setLogOpen] = useState(false);

  const finish = (next: "ai" | "menu") => {
    markTutorialCompleted();
    if (next === "ai") onPracticeAi();
    else onMainMenu();
  };

  const abandon = () => {
    markTutorialSkipped();
    onMainMenu();
  };

  const coach = coachFor(ctrl, state);
  const spotlight = spotlightFor(ctrl, state);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">tutorial — vs. coach</span>
        <div className="app-bar__actions">
          <MuteToggle />
          <button type="button" onClick={() => setLogOpen((o) => !o)}>
            Log
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Jump to free play?")) abandon();
            }}
          >
            Skip tutorial
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Leave the tutorial?")) abandon();
            }}
          >
            Menu
          </button>
        </div>
      </header>

      {!ctrl.preMatchAck && (
        <div className="tutorial-offer__backdrop">
          <div className="tutorial-offer__card" role="dialog" aria-modal="true" aria-labelledby="tutorial-premtach-title">
            <h2 className="tutorial-offer__title" id="tutorial-premtach-title">
              Goal: take them to 0 HP
            </h2>
            <p className="tutorial-offer__body">One thing at a time. No wallet. Follow the coach tips.</p>
            <div className="tutorial-offer__actions">
              <button type="button" className="tutorial-offer__primary" onClick={ackPreMatch}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <MatchView
        state={state}
        myPlayerId="A"
        dispatch={dispatch}
        lastError={lastError}
        myLabel="You (A)"
        opponentLabel="Coach (B)"
        opponentTurnLabel="Coach is thinking…"
        logOpen={logOpen}
        onCloseLog={() => setLogOpen(false)}
        spotlight={spotlight}
        tutorialMode
        onTutorialPracticeAi={() => finish("ai")}
        onTutorialMainMenu={() => finish("menu")}
      />

      {ctrl.preMatchAck && !ctrl.beatsComplete && (
        <CoachCard content={coach} showSkipTip onSkipTip={skipTip} />
      )}

      {ctrl.preMatchAck && ctrl.beatsComplete && !state.winner && (
        <div className="coach-card coach-card--exit" role="status" aria-live="polite">
          <div className="coach-card__header">
            <span className="coach-card__title">You've got the basics</span>
          </div>
          <p className="coach-card__body">Finish the fight, or jump to free practice.</p>
          <div className="coach-card__exit-actions">
            <button type="button" className="tutorial-offer__primary" onClick={() => finish("ai")}>
              Practice vs AI
            </button>
            <button type="button" className="tutorial-offer__secondary" onClick={() => finish("menu")}>
              Main menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
