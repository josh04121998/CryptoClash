import { CARD_POOL, Intent, MatchState, PlayerId, targetsFriendlyCreature } from "@cryptoclash/engine";
import { useState } from "react";
import { BoardRow } from "./BoardRow.js";
import { HandRow } from "./HandRow.js";
import { LogPanel } from "./LogPanel.js";
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
}

/**
 * The board/hand/interaction UI, generalized over which side is "me" — the
 * same view drives both the local vs-bot practice mode and online PvP; only
 * where state/dispatch come from differs (see useMatch vs useOnlineMatch).
 */
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
}: MatchViewProps) {
  const opponentId: PlayerId = myPlayerId === "A" ? "B" : "A";
  const [selection, setSelection] = useState<Selection>({ type: "none" });

  const me = state.players[myPlayerId];
  const canAct = state.activePlayer === myPlayerId && !state.winner;
  const act = (fn: () => void) => {
    fn();
    setSelection({ type: "none" });
  };

  function onHandCardClick(index: number) {
    if (!canAct) return;
    if (selection.type === "hand" && selection.handIndex === index) {
      setSelection({ type: "none" });
      return;
    }
    const templateId = me.hand[index];
    const template = CARD_POOL[templateId];
    if (template.type !== "Creature" && !needsTarget(templateId)) {
      act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: index }));
      return;
    }
    setSelection({ type: "hand", handIndex: index });
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

  const winnerText = state.winner ? (state.winner === "Draw" ? "Draw!" : state.winner === myPlayerId ? "You win!" : "You lose.") : null;

  return (
    <>
      <main className="table">
        <PlayerHeader
          name={opponentLabel}
          player={state.players[opponentId]}
          isActive={state.activePlayer === opponentId}
          targetable={enemyTargetable}
          onClick={enemyTargetable ? onEnemyPortraitClick : undefined}
        />
        <BoardRow state={state} playerId={opponentId} targetable={enemyTargetable} onSlotClick={onEnemySlotClick} />

        <VolatilityMeter volatility={state.volatility} />

        <div className="table__divider">
          {winnerText ? (
            <span className="table__winner">{winnerText}</span>
          ) : (
            <span>
              Turn {state.turnNumber} — {state.activePlayer === myPlayerId ? "Your move" : opponentTurnLabel}
            </span>
          )}
          {lastError && <span className="table__error">{lastError}</span>}
        </div>

        <BoardRow
          state={state}
          playerId={myPlayerId}
          selectedSlot={selection.type === "attacker" ? selection.slot : undefined}
          targetable={ownBoardTargetable}
          onSlotClick={onOwnSlotClick}
        />
        <PlayerHeader name={myLabel} player={me} isActive={state.activePlayer === myPlayerId} />

        <HandRow player={me} selectedIndex={selection.type === "hand" ? selection.handIndex : undefined} interactive={canAct} onCardClick={onHandCardClick} />

        <button
          type="button"
          className="end-turn-btn"
          disabled={!canAct}
          onClick={() => act(() => dispatch({ kind: "endTurn", playerId: myPlayerId }))}
        >
          End Turn
        </button>
      </main>

      <LogPanel log={state.log} open={logOpen} onClose={onCloseLog} />
    </>
  );
}
