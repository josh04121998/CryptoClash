import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { MatchView } from "../components/MatchView.js";
import { MuteToggle } from "../components/MuteToggle.js";
import { track } from "../telemetry.js";
import { markTutorialCompleted, markTutorialSkipped } from "../tutorialStorage.js";
import { coachFor, spotlightFor } from "./beats.js";
import { CoachCard } from "./CoachCard.js";
import { useTutorialMatch } from "./useTutorialMatch.js";

export interface TutorialMatchProps {
  onPracticeAi: () => void;
  onMainMenu: () => void;
}

type PendingConfirm = { title: string } | null;

export function TutorialMatch({ onPracticeAi, onMainMenu }: TutorialMatchProps) {
  const { state, dispatch, lastError, ctrl, ackPreMatch, skipTip } = useTutorialMatch();
  const [logOpen, setLogOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  // Ref guards, not state: StrictMode double-invokes mount effects in dev, and
  // `state` is mutated in place by the engine so the winner effect can re-run
  // for reasons other than the winner changing.
  const startedRef = useRef(false);
  const endedRef = useRef(false);

  // Fires for both entry points (the offer modal's "Learn the floor" and the
  // menu's Tutorial button) precisely once, because both just mount this.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track("tutorial_started");
    track("match_started", { mode: "tutorial" });
  }, []);

  useEffect(() => {
    if (!state.winner || endedRef.current) return;
    endedRef.current = true;
    track("match_ended", {
      mode: "tutorial",
      result: state.winner === "Draw" ? "draw" : state.winner === "A" ? "win" : "loss",
      turns: state.turnNumber,
    });
  }, [state.winner, state.turnNumber]);

  /** Leaving the tutorial before the board resolves is an abandoned match, whichever exit was used. */
  const trackAbandonIfUnfinished = () => {
    if (state.winner || endedRef.current) return;
    endedRef.current = true;
    track("match_ended", { mode: "tutorial", result: "abandoned", turns: state.turnNumber });
  };

  const finish = (next: "ai" | "menu") => {
    markTutorialCompleted();
    track("tutorial_completed");
    trackAbandonIfUnfinished();
    if (next === "ai") onPracticeAi();
    else onMainMenu();
  };

  const abandon = () => {
    markTutorialSkipped();
    track("tutorial_skipped");
    trackAbandonIfUnfinished();
    onMainMenu();
  };

  const coach = coachFor(ctrl, state);
  const spotlight = spotlightFor(ctrl, state);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>FLOORWARS</h1>
        <span className="app-bar__subtitle">tutorial — vs. coach</span>
        <div className="app-bar__actions">
          <MuteToggle />
          <button type="button" onClick={() => setLogOpen((o) => !o)}>
            Log
          </button>
          <button type="button" onClick={() => setPendingConfirm({ title: "Jump to free play?" })}>
            Skip tutorial
          </button>
          <button type="button" onClick={() => setPendingConfirm({ title: "Leave the tutorial?" })}>
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

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => {
            setPendingConfirm(null);
            abandon();
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
