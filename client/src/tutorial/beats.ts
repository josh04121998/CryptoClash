import { CARD_POOL, Intent, MatchState, PlayerId } from "@cryptoclash/engine";

export type BeatId = 1 | 2 | 3 | 4 | 5 | 6;

export type SpotlightTarget =
  | { kind: "energy" }
  | { kind: "handCard"; templateId: string }
  | { kind: "emptySlot"; slot: number }
  | { kind: "ownCreature"; slot: number }
  | { kind: "enemyPortrait" }
  | { kind: "enemyGuard" }
  | { kind: "endTurn" }
  | { kind: "none" };

export type BeatStep = "primary" | "afterSickness" | "done";

export interface CoachContent {
  title: string;
  body: string;
  keyword?: "Guard" | "Rush";
}

export interface TutorialControllerState {
  beat: BeatId;
  step: BeatStep;
  beatsComplete: boolean;
  feedback: string | null;
  preMatchAck: boolean;
  /** Latches true once the scripted Guard has been on the enemy board. */
  sawGuard: boolean;
}

export function initialTutorialController(): TutorialControllerState {
  return {
    beat: 1,
    step: "primary",
    beatsComplete: false,
    feedback: null,
    preMatchAck: false,
    sawGuard: false,
  };
}

export function enemyHasGuard(state: MatchState, enemyId: PlayerId = "B"): boolean {
  return state.players[enemyId].board.some((c) => c && (c.keywords.has("Guard") || c.tempKeywords.has("Guard")));
}

export function findGuardSlot(state: MatchState, enemyId: PlayerId = "B"): number {
  return state.players[enemyId].board.findIndex(
    (c) => c && (c.keywords.has("Guard") || c.tempKeywords.has("Guard")),
  );
}

export function coachFor(ctrl: TutorialControllerState, state: MatchState): CoachContent {
  if (ctrl.feedback) {
    return { title: "Hold up", body: ctrl.feedback };
  }
  switch (ctrl.beat) {
    case 1:
      return {
        title: "Energy's up",
        body: "Spend it or lose it. Play the highlighted 1-drop into the glowing empty slot.",
      };
    case 2:
      if (ctrl.step === "afterSickness") {
        return {
          title: "End the turn",
          body: "Hit End Turn. You'll be able to swing next round — unless something has Rush.",
        };
      }
      return {
        title: "New hires",
        body: "Try to attack with that creature. New hires can't swing yet — unless they've got Rush.",
        keyword: "Rush",
      };
    case 3:
      return {
        title: "Ramp + Rush",
        body: "Energy's at 2. Drop a card or pass — then attack their HP with Rush (same turn).",
        keyword: "Rush",
      };
    case 4:
      if (!enemyHasGuard(state) && !ctrl.sawGuard) {
        return {
          title: "Watch the desk",
          body: "End turn — they'll put a Guard up. Then you clear it before face.",
          keyword: "Guard",
        };
      }
      return {
        title: "Guard on the desk",
        body: "Clear the Guard before you hit their HP. Illegal face clicks bounce here.",
        keyword: "Guard",
      };
    case 5:
      return {
        title: "Face is open",
        body: "Their Guard is gone. Attack their HP once.",
      };
    case 6:
      return {
        title: "That's the floor",
        body: "Energy → Draw → Play → Attack → End. End your turn to lock it in.",
      };
    default:
      return { title: "Tutorial", body: "Keep playing — finish the fight when you're ready." };
  }
}

export function spotlightFor(ctrl: TutorialControllerState, state: MatchState, myId: PlayerId = "A"): SpotlightTarget {
  if (ctrl.beatsComplete || !ctrl.preMatchAck) return { kind: "none" };
  const me = state.players[myId];

  switch (ctrl.beat) {
    case 1: {
      const empty = me.board.findIndex((c) => c === null);
      return empty >= 0 ? { kind: "emptySlot", slot: empty } : { kind: "energy" };
    }
    case 2:
      if (ctrl.step === "afterSickness") return { kind: "endTurn" };
      {
        const slot = me.board.findIndex((c) => c !== null);
        return slot >= 0 ? { kind: "ownCreature", slot } : { kind: "endTurn" };
      }
    case 3:
      return { kind: "enemyPortrait" };
    case 4: {
      if (!enemyHasGuard(state)) return { kind: "endTurn" };
      const guardSlot = findGuardSlot(state);
      return guardSlot >= 0 ? { kind: "enemyGuard" } : { kind: "endTurn" };
    }
    case 5:
      return { kind: "enemyPortrait" };
    case 6:
      return { kind: "endTurn" };
    default:
      return { kind: "none" };
  }
}

export type IntentGate =
  | { ok: true; advance?: Partial<TutorialControllerState>; clearFeedback?: boolean }
  | { ok: false; feedback: string; advance?: Partial<TutorialControllerState> };

export function gateIntent(
  ctrl: TutorialControllerState,
  state: MatchState,
  intent: Intent,
  myId: PlayerId = "A",
): IntentGate {
  if (ctrl.beatsComplete || !ctrl.preMatchAck) {
    return { ok: true, clearFeedback: true };
  }
  if (intent.playerId !== myId) return { ok: true };

  switch (ctrl.beat) {
    case 1: {
      if (intent.kind !== "playCard") {
        return { ok: false, feedback: "Play the highlighted 1-drop into an empty slot first." };
      }
      const templateId = state.players[myId].hand[intent.handIndex];
      const template = CARD_POOL[templateId];
      if (!template || template.type !== "Creature" || template.cost !== 1) {
        return { ok: false, feedback: "Play a 1-cost creature into the glowing slot." };
      }
      return { ok: true, advance: { beat: 2, step: "primary", feedback: null }, clearFeedback: true };
    }
    case 2: {
      if (ctrl.step === "primary") {
        if (intent.kind === "attack") {
          const msg = "Not this turn. New hires can't swing yet — unless they've got Rush.";
          return { ok: false, feedback: msg, advance: { step: "afterSickness", feedback: msg } };
        }
        if (intent.kind === "endTurn") {
          return { ok: false, feedback: "Try attacking with your new creature first — then we'll end the turn." };
        }
        return { ok: false, feedback: "Select your creature and try to attack." };
      }
      if (intent.kind !== "endTurn") {
        return { ok: false, feedback: "Hit End Turn to continue." };
      }
      return { ok: true, advance: { beat: 3, step: "primary", feedback: null }, clearFeedback: true };
    }
    case 3: {
      if (intent.kind === "playCard") return { ok: true, clearFeedback: true };
      if (intent.kind === "endTurn") {
        return { ok: false, feedback: "Attack their HP with a Rush creature before ending." };
      }
      if (intent.kind === "attack") {
        const attacker = state.players[myId].board[intent.attackerSlot];
        const isRush = !!attacker && (attacker.keywords.has("Rush") || attacker.tempKeywords.has("Rush"));
        if (intent.target.type === "player" && !isRush) {
          return { ok: false, feedback: "That creature can't swing yet. Attack with your Rush creature." };
        }
        if (enemyHasGuard(state) && intent.target.type === "player") {
          const msg = "Guard is on the desk. Clear it before you hit their HP.";
          return { ok: false, feedback: msg, advance: { beat: 4, step: "primary", feedback: msg, sawGuard: true } };
        }
        if (intent.target.type === "player") {
          return { ok: true, advance: { beat: 4, step: "primary", feedback: null }, clearFeedback: true };
        }
        return { ok: true, clearFeedback: true };
      }
      return { ok: false, feedback: "Play something (optional) or attack their portrait." };
    }
    case 4: {
      if (!enemyHasGuard(state) && !ctrl.sawGuard) {
        return { ok: true, clearFeedback: true };
      }
      if (intent.kind === "playCard") return { ok: true, clearFeedback: true };
      if (intent.kind === "endTurn") {
        return { ok: false, feedback: "Clear the Guard before you end the turn." };
      }
      if (intent.kind === "attack") {
        if (intent.target.type === "player") {
          return { ok: false, feedback: "Guard is on the desk. Clear it before you hit their HP." };
        }
        const guardSlot = findGuardSlot(state);
        if (guardSlot !== -1 && intent.target.type === "creature" && intent.target.slot !== guardSlot) {
          return { ok: false, feedback: "Attack the Guard first." };
        }
        return { ok: true, clearFeedback: true };
      }
      return { ok: false, feedback: "Attack the Guard." };
    }
    case 5: {
      if (intent.kind === "playCard") return { ok: true, clearFeedback: true };
      if (intent.kind === "endTurn") {
        return { ok: false, feedback: "Attack their HP once while the lane is open." };
      }
      if (intent.kind === "attack" && intent.target.type === "player") {
        return { ok: true, advance: { beat: 6, step: "primary", feedback: null }, clearFeedback: true };
      }
      if (intent.kind === "attack") {
        return { ok: false, feedback: "Go face — click their portrait." };
      }
      return { ok: false, feedback: "Attack their HP." };
    }
    case 6: {
      if (intent.kind !== "endTurn") {
        return { ok: false, feedback: "End the turn to finish the lesson." };
      }
      return { ok: true, advance: { beatsComplete: true, feedback: null }, clearFeedback: true };
    }
    default:
      return { ok: true };
  }
}

export function afterIntent(
  ctrl: TutorialControllerState,
  state: MatchState,
): Partial<TutorialControllerState> | null {
  if (ctrl.beatsComplete) return null;
  const patch: Partial<TutorialControllerState> = {};
  if (enemyHasGuard(state)) patch.sawGuard = true;
  if (ctrl.beat === 4 && (ctrl.sawGuard || patch.sawGuard) && !enemyHasGuard(state)) {
    patch.beat = 5;
    patch.step = "primary";
    patch.feedback = null;
  }
  return Object.keys(patch).length ? patch : null;
}
