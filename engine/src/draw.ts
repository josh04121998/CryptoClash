import { CARD_POOL } from "./cards.js";
import { checkWin, pushLog } from "./matchOps.js";
import { MatchState, PlayerId } from "./types.js";

export const MAX_HAND_SIZE = 10;

export function drawCard(state: MatchState, playerId: PlayerId) {
  const player = state.players[playerId];
  if (player.deck.length === 0) {
    player.fatigue += 1;
    player.hp -= player.fatigue;
    pushLog(state, `${playerId} draws from an empty deck and takes ${player.fatigue} fatigue damage (HP: ${player.hp}).`);
    checkWin(state);
    return;
  }
  const cardId = player.deck.shift()!;
  if (player.hand.length >= MAX_HAND_SIZE) {
    pushLog(state, `${playerId}'s hand is full — ${CARD_POOL[cardId].name} is discarded.`);
    return;
  }
  player.hand.push(cardId);
}
