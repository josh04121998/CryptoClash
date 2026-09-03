import { CARD_POOL } from "./cards.js";
import { MatchState, PlayerId } from "./types.js";
import { getAdjacentSlots } from "./util.js";

function computeAuraBonusAttack(state: MatchState, playerId: PlayerId, slot: number): number {
  const board = state.players[playerId].board;
  const creature = board[slot];
  if (!creature) return 0;
  const template = CARD_POOL[creature.templateId];

  let bonus = 0;
  for (const adjSlot of getAdjacentSlots(slot)) {
    const neighbor = board[adjSlot];
    if (!neighbor) continue;
    const neighborTemplate = CARD_POOL[neighbor.templateId];
    if (neighborTemplate.aura?.filter === "adjacentSameFaction" && neighborTemplate.faction === template.faction) {
      bonus += neighborTemplate.aura.attack ?? 0;
    }
  }
  return bonus;
}

/** Base + accumulated buffs + live aura contribution from the current board. */
export function getEffectiveAttack(state: MatchState, playerId: PlayerId, slot: number): number {
  const creature = state.players[playerId].board[slot];
  if (!creature) return 0;
  return Math.max(0, creature.baseAttack + creature.buffAttack + computeAuraBonusAttack(state, playerId, slot));
}
