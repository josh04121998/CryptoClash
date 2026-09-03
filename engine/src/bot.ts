import { CARD_POOL } from "./cards.js";
import { applyIntent } from "./engine.js";
import { BOARD_SIZE, Intent, MatchState, PlayerId } from "./types.js";
import { enemyOf } from "./util.js";

function tryIntent(state: MatchState, intent: Intent): boolean {
  try {
    applyIntent(state, intent);
    return true;
  } catch {
    return false;
  }
}

function playAffordableCards(state: MatchState, playerId: PlayerId) {
  let progressed = true;
  while (progressed) {
    progressed = false;
    const player = state.players[playerId];
    for (let i = 0; i < player.hand.length; i++) {
      const template = CARD_POOL[player.hand[i]];
      if (template.cost > player.energy) continue;

      let slot: number | undefined;
      if (template.type === "Creature") {
        slot = player.board.findIndex((c) => c === null);
        if (slot === -1) continue;
      }

      const target = template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget)
        ? ({ type: "player", playerId: enemyOf(playerId) } as const)
        : undefined;

      if (tryIntent(state, { kind: "playCard", playerId, handIndex: i, slot, target })) {
        progressed = true;
        break; // hand indices shifted; rescan from the top
      }
    }
  }
}

function attackWithBoard(state: MatchState, playerId: PlayerId) {
  const enemyId = enemyOf(playerId);
  for (let slot = 0; slot < BOARD_SIZE; slot++) {
    if (!state.players[playerId].board[slot]) continue;
    const enemyGuardSlot = state.players[enemyId].board.findIndex(
      (c) => c && (c.keywords.has("Guard") || c.tempKeywords.has("Guard")),
    );
    const target =
      enemyGuardSlot !== -1
        ? ({ type: "creature", playerId: enemyId, slot: enemyGuardSlot } as const)
        : ({ type: "player", playerId: enemyId } as const);
    tryIntent(state, { kind: "attack", playerId, attackerSlot: slot, target });
  }
}

/**
 * Greedy heuristic opponent: plays whatever it can afford, attacks with
 * everything able to, ends turn. Not a strategy AI — a placeholder for
 * solo/offline play and engine smoke tests until real matchmaking exists.
 */
export function takeBotTurn(state: MatchState, playerId: PlayerId) {
  playAffordableCards(state, playerId);
  attackWithBoard(state, playerId);
  tryIntent(state, { kind: "endTurn", playerId });
}
