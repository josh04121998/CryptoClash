import { CARD_POOL } from "./cards.js";
import { createBoardCreature } from "./effects.js";
import { drawCard, MAX_HAND_SIZE } from "./draw.js";
import { pushLog } from "./matchOps.js";
import { BOARD_SIZE, MatchState, MAX_PLAYER_HP, PlayerId } from "./types.js";
import { firstEmptySlot } from "./util.js";

/**
 * Tutorial-only helpers. Every export asserts `state.tutorial === true` so
 * ranked / online / normal Vs AI can never accidentally call them.
 */

function assertTutorial(state: MatchState): void {
  if (!state.tutorial) {
    throw new Error("Tutorial helpers require createMatch(..., { tutorial: true }).");
  }
}

/** Put a card into a player's hand (clamped to max hand size). */
export function injectCard(state: MatchState, playerId: PlayerId, templateId: string): void {
  assertTutorial(state);
  if (!CARD_POOL[templateId]) throw new Error(`Unknown card: ${templateId}`);
  const player = state.players[playerId];
  if (player.hand.length >= MAX_HAND_SIZE) {
    pushLog(state, `[tutorial] ${playerId}'s hand full — could not inject ${CARD_POOL[templateId].name}.`);
    return;
  }
  player.hand.push(templateId);
  pushLog(state, `[tutorial] ${CARD_POOL[templateId].name} added to ${playerId}'s hand.`);
}

/** Draw exactly `count` cards (fatigue-safe wrapper around drawCard). */
export function forceDraw(state: MatchState, playerId: PlayerId, count = 1): void {
  assertTutorial(state);
  for (let i = 0; i < count; i++) drawCard(state, playerId);
}

/** Summon a creature into an empty slot (or a specific slot if empty). */
export function injectCreature(
  state: MatchState,
  playerId: PlayerId,
  templateId: string,
  slot?: number,
): number {
  assertTutorial(state);
  if (!CARD_POOL[templateId]) throw new Error(`Unknown card: ${templateId}`);
  const board = state.players[playerId].board;
  const target = slot !== undefined ? slot : firstEmptySlot(board);
  if (target < 0 || target >= BOARD_SIZE) throw new Error("No empty board slot for injectCreature.");
  if (board[target] !== null) throw new Error(`Slot ${target} is occupied.`);
  board[target] = createBoardCreature(state, templateId);
  pushLog(state, `[tutorial] ${CARD_POOL[templateId].name} enters ${playerId}'s board at slot ${target + 1}.`);
  return target;
}

/** Soften lethal pressure — clamp player HP up to at least `minHp`. */
export function ensureMinHp(state: MatchState, playerId: PlayerId, minHp: number): void {
  assertTutorial(state);
  const player = state.players[playerId];
  if (player.hp < minHp) {
    const before = player.hp;
    player.hp = Math.min(MAX_PLAYER_HP, minHp);
    pushLog(state, `[tutorial] ${playerId} HP softened ${before} → ${player.hp}.`);
  }
}
