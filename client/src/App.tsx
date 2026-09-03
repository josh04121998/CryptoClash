import { CARD_POOL } from "@cryptoclash/engine";
import { useState } from "react";
import { BoardRow } from "./components/BoardRow.js";
import { HandRow } from "./components/HandRow.js";
import { LogPanel } from "./components/LogPanel.js";
import { PlayerHeader } from "./components/PlayerHeader.js";
import { useMatch } from "./useMatch.js";

type Selection = { type: "none" } | { type: "hand"; handIndex: number } | { type: "attacker"; slot: number };

function needsTarget(templateId: string): boolean {
  const template = CARD_POOL[templateId];
  return Boolean(template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget));
}

export default function App() {
  const { state, dispatch, restart, lastError } = useMatch();
  const [selection, setSelection] = useState<Selection>({ type: "none" });
  const [logOpen, setLogOpen] = useState(false);

  const canAct = state.activePlayer === "A" && !state.winner;
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
    const templateId = state.players.A.hand[index];
    const template = CARD_POOL[templateId];
    if (template.type !== "Creature" && !needsTarget(templateId)) {
      act(() => dispatch({ kind: "playCard", playerId: "A", handIndex: index }));
      return;
    }
    setSelection({ type: "hand", handIndex: index });
  }

  function onOwnSlotClick(slot: number) {
    if (!canAct) return;
    const creature = state.players.A.board[slot];

    if (selection.type === "hand") {
      const templateId = state.players.A.hand[selection.handIndex];
      const template = CARD_POOL[templateId];
      if (template.type === "Creature" && !creature) {
        act(() => dispatch({ kind: "playCard", playerId: "A", handIndex: selection.handIndex, slot }));
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
    const enemyCreature = state.players.B.board[slot];

    if (selection.type === "hand") {
      const templateId = state.players.A.hand[selection.handIndex];
      if (needsTarget(templateId) && enemyCreature) {
        act(() =>
          dispatch({
            kind: "playCard",
            playerId: "A",
            handIndex: selection.handIndex,
            target: { type: "creature", playerId: "B", slot },
          }),
        );
      }
      return;
    }

    if (selection.type === "attacker" && enemyCreature) {
      act(() =>
        dispatch({ kind: "attack", playerId: "A", attackerSlot: selection.slot, target: { type: "creature", playerId: "B", slot } }),
      );
    }
  }

  function onEnemyPortraitClick() {
    if (!canAct) return;

    if (selection.type === "hand") {
      const templateId = state.players.A.hand[selection.handIndex];
      if (needsTarget(templateId)) {
        act(() =>
          dispatch({
            kind: "playCard",
            playerId: "A",
            handIndex: selection.handIndex,
            target: { type: "player", playerId: "B" },
          }),
        );
      }
      return;
    }

    if (selection.type === "attacker") {
      act(() => dispatch({ kind: "attack", playerId: "A", attackerSlot: selection.slot, target: { type: "player", playerId: "B" } }));
    }
  }

  const enemyTargetable =
    canAct && (selection.type === "attacker" || (selection.type === "hand" && needsTarget(state.players.A.hand[selection.handIndex])));

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">prototype — vs. bot</span>
        <div className="app-bar__actions">
          <button type="button" onClick={() => setLogOpen((o) => !o)}>
            Log
          </button>
          <button type="button" onClick={restart}>
            New Match
          </button>
        </div>
      </header>

      <main className="table">
        <PlayerHeader name="Bot (B)" player={state.players.B} isActive={state.activePlayer === "B"} targetable={enemyTargetable} onClick={enemyTargetable ? onEnemyPortraitClick : undefined} />
        <BoardRow state={state} playerId="B" targetable={enemyTargetable} onSlotClick={onEnemySlotClick} />

        <div className="table__divider">
          {state.winner ? (
            <span className="table__winner">{state.winner === "Draw" ? "Draw!" : `${state.winner === "A" ? "You win!" : "Bot wins."}`}</span>
          ) : (
            <span>Turn {state.turnNumber} — {state.activePlayer === "A" ? "Your move" : "Bot is thinking…"}</span>
          )}
          {lastError && <span className="table__error">{lastError}</span>}
        </div>

        <BoardRow
          state={state}
          playerId="A"
          selectedSlot={selection.type === "attacker" ? selection.slot : undefined}
          onSlotClick={onOwnSlotClick}
        />
        <PlayerHeader name="You (A)" player={state.players.A} isActive={state.activePlayer === "A"} />

        <HandRow
          player={state.players.A}
          selectedIndex={selection.type === "hand" ? selection.handIndex : undefined}
          interactive={canAct}
          onCardClick={onHandCardClick}
        />

        <button type="button" className="end-turn-btn" disabled={!canAct} onClick={() => act(() => dispatch({ kind: "endTurn", playerId: "A" }))}>
          End Turn
        </button>
      </main>

      <LogPanel log={state.log} open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
