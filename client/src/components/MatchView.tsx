import { CARD_POOL, Intent, MatchState, PlayerId, targetsFriendlyCreature } from "@cryptoclash/engine";
import { useEffect, useRef, useState } from "react";
import { playClickSound, playErrorSound, playEndTurnSound, playSelectSound } from "../sound.js";
import type { SpotlightTarget } from "../tutorial/beats.js";
import { useAttackAnimations } from "../useAttackAnimations.js";
import { useMatchSounds } from "../useMatchSounds.js";
import { BoardRow } from "./BoardRow.js";
import { HandRow } from "./HandRow.js";
import { LogPanel } from "./LogPanel.js";
import { MatchResultOverlay } from "./MatchResultOverlay.js";
import { OpponentHandRow } from "./OpponentHandRow.js";
import { PlayerHeader } from "./PlayerHeader.js";
import { VolatilityMeter } from "./VolatilityMeter.js";

type Selection = { type: "none" } | { type: "hand"; handIndex: number } | { type: "attacker"; slot: number };

function needsTarget(templateId: string): boolean {
  const template = CARD_POOL[templateId];
  return Boolean(template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget));
}

function targetsFriendly(templateId: string): boolean {
  return targetsFriendlyCreature(CARD_POOL[templateId]);
}

/** A drop-zone element under the pointer, resolved via elementFromPoint at drag-end — see onCardDragEnd. */
function resolveDropZone(clientX: number, clientY: number): { zone: string; slot?: number; empty?: boolean } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const zoneEl = el?.closest<HTMLElement>("[data-drop-zone]");
  if (!zoneEl) return null;
  const { dropZone, slot, empty } = zoneEl.dataset;
  return { zone: dropZone!, slot: slot !== undefined ? Number(slot) : undefined, empty: empty === "true" };
}

export interface MatchViewProps {
  state: MatchState;
  myPlayerId: PlayerId;
  dispatch: (intent: Intent) => void;
  lastError: string | null;
  myLabel: string;
  opponentLabel: string;
  opponentTurnLabel: string;
  logOpen: boolean;
  onCloseLog: () => void;
  /** tutorial_v1 */
  spotlight?: SpotlightTarget;
  tutorialMode?: boolean;
  onTutorialPracticeAi?: () => void;
  onTutorialMainMenu?: () => void;
}

export function MatchView({
  state,
  myPlayerId,
  dispatch,
  lastError,
  myLabel,
  opponentLabel,
  opponentTurnLabel,
  logOpen,
  onCloseLog,
  spotlight = { kind: "none" },
  tutorialMode = false,
  onTutorialPracticeAi,
  onTutorialMainMenu,
}: MatchViewProps) {
  const opponentId: PlayerId = myPlayerId === "A" ? "B" : "A";
  const [selection, setSelection] = useState<Selection>({ type: "none" });

  const { marketEventFlash } = useMatchSounds(state, myPlayerId);
  const attackingSlots = useAttackAnimations(state);
  const [resultDismissed, setResultDismissed] = useState(false);
  const prevErrorRef = useRef(lastError);
  useEffect(() => {
    if (lastError && lastError !== prevErrorRef.current) playErrorSound();
    prevErrorRef.current = lastError;
  }, [lastError]);

  const [flashing, setFlashing] = useState(false);
  const prevFlashCountRef = useRef(marketEventFlash);
  useEffect(() => {
    if (marketEventFlash !== prevFlashCountRef.current) {
      prevFlashCountRef.current = marketEventFlash;
      setFlashing(true);
      const timer = setTimeout(() => setFlashing(false), 500);
      return () => clearTimeout(timer);
    }
  }, [marketEventFlash]);

  const me = state.players[myPlayerId];
  const canAct = state.activePlayer === myPlayerId && !state.winner;
  const act = (fn: () => void) => {
    fn();
    setSelection({ type: "none" });
  };

  // A tap always just previews/selects — never commits a play on its own, regardless of card
  // type. (Previously a non-targeted spell/item dispatched straight from this first click, with
  // no way to just look at what the card does — a real reported bug.) Creature/targeted-spell
  // cards commit via a second click on a valid slot/portrait (onOwnSlotClick/onEnemySlotClick/
  // onEnemyPortraitClick below); a no-target card commits via confirmNoTargetPlay's prompt.
  function onCardTap(index: number) {
    if (!canAct) return;
    if (selection.type === "hand" && selection.handIndex === index) {
      playClickSound();
      setSelection({ type: "none" });
      return;
    }
    playSelectSound();
    setSelection({ type: "hand", handIndex: index });
  }

  function confirmNoTargetPlay() {
    if (!canAct || selection.type !== "hand") return;
    act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: selection.handIndex }));
  }

  function onCardDragStart(index: number) {
    if (!canAct) return;
    playSelectSound();
    setSelection({ type: "hand", handIndex: index });
  }

  // Drag committed (moved past the threshold and released) — resolve whatever's under the
  // pointer via data-drop-zone attributes and dispatch the same way a click-driven confirm
  // would. A drop that lands nowhere valid just cancels the selection, card snaps back to hand.
  function onCardDragEnd(index: number, clientX: number, clientY: number) {
    if (!canAct) {
      setSelection({ type: "none" });
      return;
    }
    const templateId = me.hand[index];
    const template = CARD_POOL[templateId];
    const drop = resolveDropZone(clientX, clientY);

    if (template.type === "Creature") {
      if (drop?.zone === "own-slot" && drop.empty && drop.slot !== undefined) {
        act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: index, slot: drop.slot }));
        return;
      }
      setSelection({ type: "none" });
      return;
    }

    if (needsTarget(templateId)) {
      if (targetsFriendly(templateId)) {
        if (drop?.zone === "own-slot" && drop.empty === false && drop.slot !== undefined) {
          act(() =>
            dispatch({
              kind: "playCard",
              playerId: myPlayerId,
              handIndex: index,
              target: { type: "creature", playerId: myPlayerId, slot: drop.slot! },
            }),
          );
          return;
        }
      } else {
        if (drop?.zone === "enemy-slot" && drop.empty === false && drop.slot !== undefined) {
          act(() =>
            dispatch({
              kind: "playCard",
              playerId: myPlayerId,
              handIndex: index,
              target: { type: "creature", playerId: opponentId, slot: drop.slot! },
            }),
          );
          return;
        }
        if (drop?.zone === "enemy-portrait") {
          act(() =>
            dispatch({
              kind: "playCard",
              playerId: myPlayerId,
              handIndex: index,
              target: { type: "player", playerId: opponentId },
            }),
          );
          return;
        }
      }
      setSelection({ type: "none" });
      return;
    }

    // No target required — any recognized drop zone on the battlefield commits it (see the
    // data-drop-zone="battlefield" wrapper below, which fills the gaps between slots/portraits).
    if (drop) {
      act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: index }));
      return;
    }
    setSelection({ type: "none" });
  }

  function onOwnSlotClick(slot: number) {
    if (!canAct) return;
    const creature = me.board[slot];

    if (selection.type === "hand") {
      const templateId = me.hand[selection.handIndex];
      const template = CARD_POOL[templateId];
      if (template.type === "Creature" && !creature) {
        act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: selection.handIndex, slot }));
        return;
      }
      if (needsTarget(templateId) && targetsFriendly(templateId) && creature) {
        act(() =>
          dispatch({
            kind: "playCard",
            playerId: myPlayerId,
            handIndex: selection.handIndex,
            target: { type: "creature", playerId: myPlayerId, slot },
          }),
        );
      }
      return;
    }

    if (!creature || creature.hasAttackedThisTurn) {
      setSelection({ type: "none" });
      return;
    }
    playSelectSound();
    setSelection(selection.type === "attacker" && selection.slot === slot ? { type: "none" } : { type: "attacker", slot });
  }

  function onEnemySlotClick(slot: number) {
    if (!canAct) return;
    const enemyCreature = state.players[opponentId].board[slot];

    if (selection.type === "hand") {
      const templateId = me.hand[selection.handIndex];
      if (needsTarget(templateId) && !targetsFriendly(templateId) && enemyCreature) {
        act(() =>
          dispatch({
            kind: "playCard",
            playerId: myPlayerId,
            handIndex: selection.handIndex,
            target: { type: "creature", playerId: opponentId, slot },
          }),
        );
      }
      return;
    }

    if (selection.type === "attacker" && enemyCreature) {
      act(() =>
        dispatch({
          kind: "attack",
          playerId: myPlayerId,
          attackerSlot: selection.slot,
          target: { type: "creature", playerId: opponentId, slot },
        }),
      );
    }
  }

  function onEnemyPortraitClick() {
    if (!canAct) return;

    if (selection.type === "hand") {
      const templateId = me.hand[selection.handIndex];
      if (needsTarget(templateId) && !targetsFriendly(templateId)) {
        act(() =>
          dispatch({
            kind: "playCard",
            playerId: myPlayerId,
            handIndex: selection.handIndex,
            target: { type: "player", playerId: opponentId },
          }),
        );
      }
      return;
    }

    if (selection.type === "attacker") {
      act(() =>
        dispatch({ kind: "attack", playerId: myPlayerId, attackerSlot: selection.slot, target: { type: "player", playerId: opponentId } }),
      );
    }
  }

  const enemyTargetable =
    canAct &&
    (selection.type === "attacker" ||
      (selection.type === "hand" && needsTarget(me.hand[selection.handIndex]) && !targetsFriendly(me.hand[selection.handIndex])));

  const ownBoardTargetable =
    canAct && selection.type === "hand" && needsTarget(me.hand[selection.handIndex]) && targetsFriendly(me.hand[selection.handIndex]);

  // A selected card that needs no target (a spell/item with no requiresTarget effect) has no
  // slot/portrait to click to confirm — this is the tap-path equivalent of "drop it anywhere
  // on the battlefield" for drag (see onCardDragEnd's no-target branch).
  const pendingNoTargetCard =
    canAct && selection.type === "hand" && !needsTarget(me.hand[selection.handIndex]) && CARD_POOL[me.hand[selection.handIndex]].type !== "Creature"
      ? CARD_POOL[me.hand[selection.handIndex]]
      : undefined;

  const winnerText = state.winner ? (state.winner === "Draw" ? "Draw!" : state.winner === myPlayerId ? "You win!" : "You lose.") : null;

  const mySpotlightSlot = spotlight.kind === "emptySlot" || spotlight.kind === "ownCreature" ? spotlight.slot : undefined;
  const enemySpotlightGuard = spotlight.kind === "enemyGuard";
  const spotlightEnergy = spotlight.kind === "energy";
  const spotlightPortrait = spotlight.kind === "enemyPortrait";
  const spotlightEndTurn = spotlight.kind === "endTurn";
  const handSpotlight =
    spotlight.kind === "handCard"
      ? spotlight.templateId
      : spotlight.kind === "energy" || spotlight.kind === "emptySlot"
        ? me.hand.find((templateId) => {
            const template = CARD_POOL[templateId];
            return template?.type === "Creature" && template.cost === 1;
          })
        : undefined;

  const showTutorialResult = Boolean(tutorialMode && state.winner);

  return (
    <>
      <main className={flashing ? "table table--market-event-flash" : "table"}>
        {/* data-drop-zone="battlefield" is the drag-and-drop fallback for the gaps between
            slots/portraits (the volatility meter, the turn divider, spacing between cards) —
            BoardRow/PlayerHeader tag their own more specific zones, which `.closest` picks up
            first when the drop actually lands on one. Deliberately excludes the hand row, my own
            portrait, and End Turn below, so dropping a card back on itself/those never counts. */}
        <div data-drop-zone="battlefield">
          <OpponentHandRow count={state.players[opponentId].hand.length} />
          <PlayerHeader
            name={opponentLabel}
            player={state.players[opponentId]}
            isActive={state.activePlayer === opponentId}
            targetable={enemyTargetable}
            onClick={enemyTargetable ? onEnemyPortraitClick : undefined}
            spotlightPortrait={spotlightPortrait}
            isDropZone
          />
          <BoardRow
            state={state}
            playerId={opponentId}
            side="enemy"
            targetable={enemyTargetable}
            attackingSlots={attackingSlots}
            attackDirection="down"
            onSlotClick={onEnemySlotClick}
            spotlightGuard={enemySpotlightGuard}
          />

          <VolatilityMeter volatility={state.volatility} />

          <div className="table__divider">
            {winnerText ? (
              <span className="table__winner">{winnerText}</span>
            ) : pendingNoTargetCard ? (
              <button type="button" className="table__play-prompt" onClick={confirmNoTargetPlay}>
                ▶ Play {pendingNoTargetCard.name}
              </button>
            ) : (
              <span>
                Turn {state.turnNumber} —{" "}
                {state.activePlayer === myPlayerId ? <strong className="table__your-turn">Your move</strong> : opponentTurnLabel}
              </span>
            )}
            {lastError && (
              <span className="table__error" role="status" aria-live="polite">
                {lastError}
              </span>
            )}
          </div>

          <BoardRow
            state={state}
            playerId={myPlayerId}
            side="own"
            selectedSlot={selection.type === "attacker" ? selection.slot : undefined}
            targetable={ownBoardTargetable}
            attackingSlots={attackingSlots}
            attackDirection="up"
            onSlotClick={onOwnSlotClick}
            spotlightSlot={mySpotlightSlot}
          />
        </div>
        <PlayerHeader
          name={myLabel}
          player={me}
          isActive={state.activePlayer === myPlayerId}
          spotlightEnergy={spotlightEnergy}
        />

        <HandRow
          player={me}
          selectedIndex={selection.type === "hand" ? selection.handIndex : undefined}
          interactive={canAct}
          onCardTap={onCardTap}
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
          spotlightTemplateId={handSpotlight}
        />

        <button
          type="button"
          className={["end-turn-btn", spotlightEndTurn ? "end-turn-btn--spotlight" : ""].filter(Boolean).join(" ")}
          disabled={!canAct}
          onClick={() => {
            playEndTurnSound();
            act(() => dispatch({ kind: "endTurn", playerId: myPlayerId }));
          }}
        >
          End Turn
        </button>
      </main>

      <LogPanel log={state.log} open={logOpen} onClose={onCloseLog} />

      {state.winner && !resultDismissed && (
        <MatchResultOverlay
          winner={state.winner}
          myPlayerId={myPlayerId}
          onDismiss={() => setResultDismissed(true)}
          tutorialExit={showTutorialResult}
          onPracticeAi={onTutorialPracticeAi}
          onMainMenu={onTutorialMainMenu}
        />
      )}
    </>
  );
}
