import { BOARD_SIZE, BoardCreature, CARD_POOL, MatchState, PlayerId, getEffectiveAttack } from "@cryptoclash/engine";
import { CardFace } from "./CardFace.js";

export interface BoardRowProps {
  state: MatchState;
  playerId: PlayerId;
  selectedSlot?: number;
  targetable?: boolean;
  onSlotClick: (slot: number) => void;
}

function allKeywords(creature: BoardCreature): string[] {
  return Array.from(new Set([...creature.keywords, ...creature.tempKeywords]));
}

export function BoardRow({ state, playerId, selectedSlot, targetable = false, onSlotClick }: BoardRowProps) {
  const board = state.players[playerId].board;

  return (
    <div className="board-row">
      {Array.from({ length: BOARD_SIZE }, (_, slot) => {
        const creature = board[slot];
        if (!creature) {
          return (
            <button
              key={slot}
              type="button"
              className="board-slot board-slot--empty"
              onClick={() => onSlotClick(slot)}
            />
          );
        }
        const template = CARD_POOL[creature.templateId];
        return (
          <div key={slot} className="board-slot">
            <CardFace
              template={template}
              attack={getEffectiveAttack(state, playerId, slot)}
              health={creature.health}
              maxHealth={creature.maxHealth}
              keywords={allKeywords(creature)}
              selected={selectedSlot === slot}
              dimmed={creature.hasAttackedThisTurn}
              onClick={() => onSlotClick(slot)}
            />
            {targetable && <div className="board-slot__target-ring" />}
          </div>
        );
      })}
    </div>
  );
}
