import {
  Intent,
  MatchState,
  applyIntent,
  createMatch,
  ensureMinHp,
  injectCard,
} from "@cryptoclash/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TutorialControllerState,
  afterIntent,
  enemyHasGuard,
  gateIntent,
  initialTutorialController,
} from "./beats.js";
import { TUTORIAL_BOT_DECK, TUTORIAL_PLAYER_DECK, TUTORIAL_RUSH_CARD, TUTORIAL_SEED } from "./decks.js";
import { takeTutorialBotTurn } from "./scriptedBot.js";

const BOT_DELAY_MS = 650;

function ensureRushInHand(state: MatchState) {
  if (!state.players.A.hand.includes(TUTORIAL_RUSH_CARD)) {
    injectCard(state, "A", TUTORIAL_RUSH_CARD);
  }
}

export function useTutorialMatch() {
  const stateRef = useRef<MatchState>(
    createMatch(TUTORIAL_PLAYER_DECK, TUTORIAL_BOT_DECK, TUTORIAL_SEED, {
      tutorial: true,
      preserveDeckOrder: true,
    }),
  );
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [ctrl, setCtrl] = useState<TutorialControllerState>(initialTutorialController);
  const ctrlRef = useRef(ctrl);
  ctrlRef.current = ctrl;

  const bump = () => setVersion((v) => v + 1);

  const ackPreMatch = useCallback(() => {
    setCtrl((c) => ({ ...c, preMatchAck: true }));
  }, []);

  const skipTip = useCallback(() => {
    setCtrl((c) => {
      if (c.beatsComplete) return c;
      if (c.beat >= 6) return { ...c, beatsComplete: true, feedback: null };
      return {
        ...c,
        beat: ((c.beat + 1) as TutorialControllerState["beat"]),
        step: "primary",
        feedback: null,
      };
    });
  }, []);

  const dispatch = useCallback((intent: Intent) => {
    const state = stateRef.current;
    const current = ctrlRef.current;
    const gate = gateIntent(current, state, intent, "A");

    if (!gate.ok) {
      setCtrl({
        ...current,
        ...(gate.advance ?? {}),
        feedback: gate.feedback,
      });
      setLastError(null);
      bump();
      return;
    }

    try {
      applyIntent(state, intent);
      setLastError(null);
    } catch (e) {
      setLastError((e as Error).message);
      bump();
      return;
    }

    if (!current.beatsComplete) ensureMinHp(state, "A", 10);

    let next: TutorialControllerState = {
      ...current,
      ...(gate.advance ?? {}),
      feedback: gate.clearFeedback ? null : current.feedback,
    };
    const post = afterIntent(next, state);
    if (post) next = { ...next, ...post };
    setCtrl(next);
    bump();
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (state.activePlayer === "A" && state.turnNumber >= 2 && !state.winner) {
      ensureRushInHand(state);
    }
    if (enemyHasGuard(state) && !ctrl.sawGuard) {
      setCtrl((c) => (c.sawGuard ? c : { ...c, sawGuard: true }));
    }
  }, [version, ctrl.sawGuard]);

  useEffect(() => {
    const state = stateRef.current;
    if (state.winner || state.activePlayer !== "B") return;
    const timer = setTimeout(() => {
      takeTutorialBotTurn(stateRef.current, "B");
      ensureMinHp(stateRef.current, "A", 10);
      const post = afterIntent(ctrlRef.current, stateRef.current);
      if (post) setCtrl((c) => ({ ...c, ...post }));
      else if (enemyHasGuard(stateRef.current)) {
        setCtrl((c) => (c.sawGuard ? c : { ...c, sawGuard: true }));
      }
      setVersion((v) => v + 1);
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [version]);

  const restart = useCallback(() => {
    stateRef.current = createMatch(TUTORIAL_PLAYER_DECK, TUTORIAL_BOT_DECK, TUTORIAL_SEED, {
      tutorial: true,
      preserveDeckOrder: true,
    });
    setCtrl(initialTutorialController());
    setLastError(null);
    bump();
  }, []);

  return {
    state: stateRef.current,
    version,
    dispatch,
    restart,
    lastError,
    ctrl,
    ackPreMatch,
    skipTip,
  };
}
