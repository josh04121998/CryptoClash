import { CARD_POOL } from "./cards.js";
import { applyIntent } from "./engine.js";
import { getEffectiveAttack } from "./stats.js";
import { BOARD_SIZE, BoardCreature, Intent, MatchState, PlayerId, TargetRef } from "./types.js";
import { enemyOf, firstEmptySlot, getAdjacentSlots, targetsFriendlyCreature } from "./util.js";

function tryIntent(state: MatchState, intent: Intent): boolean {
  try {
    applyIntent(state, intent);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer an empty slot adjacent to an existing friendly creature whose aura
 * would actually pick up the new creature (same faction, `adjacentSameFaction`
 * filter) — e.g. landing next to a Moon Dog. Falls back to the first empty
 * slot when no such neighbor exists. Deliberately a cheap, local scan, not a
 * full-board placement search.
 */
function pickCreatureSlot(state: MatchState, playerId: PlayerId, faction: string): number {
  const board = state.players[playerId].board;
  for (let slot = 0; slot < BOARD_SIZE; slot++) {
    if (board[slot] !== null) continue;
    const buffed = getAdjacentSlots(slot).some((adjSlot) => {
      const neighbor = board[adjSlot];
      if (!neighbor) return false;
      const neighborTemplate = CARD_POOL[neighbor.templateId];
      return neighborTemplate.aura?.filter === "adjacentSameFaction" && neighborTemplate.faction === faction;
    });
    if (buffed) return slot;
  }
  return firstEmptySlot(board);
}

/**
 * Try affordable cards biggest-cost-first each pass rather than in hand
 * order. The "while progressed" rescan below already retries every card
 * every pass, so this only changes *which* card gets played when more than
 * one is affordable at once — but that choice matters: hand order is
 * draw-order, unrelated to cost, so playing whatever's first can strand a
 * bigger card for the rest of the turn (e.g. energy 6, hand [cost 2, cost 5]
 * in that order: hand-order spends the 2 first and can never fit the 5 into
 * the remaining 4; cost-order spends the 5 first and only 1 goes unused).
 * Biggest-first minimizes leftover unspent energy.
 */
function playOrder(hand: string[]): number[] {
  return hand
    .map((_, index) => index)
    .sort((a, b) => CARD_POOL[hand[b]].cost - CARD_POOL[hand[a]].cost);
}

function playAffordableCards(state: MatchState, playerId: PlayerId) {
  let progressed = true;
  while (progressed) {
    progressed = false;
    const player = state.players[playerId];
    for (const i of playOrder(player.hand)) {
      const template = CARD_POOL[player.hand[i]];
      if (template.cost > player.energy) continue;

      let slot: number | undefined;
      if (template.type === "Creature") {
        slot = pickCreatureSlot(state, playerId, template.faction);
        if (slot === -1) continue;
      }

      let target: TargetRef | undefined;
      if (template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget)) {
        if (targetsFriendlyCreature(template)) {
          const friendlySlot = player.board.findIndex((c) => c !== null);
          if (friendlySlot === -1) continue; // nothing to buff yet — try again once something's on board
          target = { type: "creature", playerId, slot: friendlySlot };
        } else {
          target = { type: "player", playerId: enemyOf(playerId) };
        }
      }

      if (tryIntent(state, { kind: "playCard", playerId, handIndex: i, slot, target })) {
        progressed = true;
        break; // hand indices shifted; rescan from the top
      }
    }
  }
}

function canAttackThisTurn(state: MatchState, creature: BoardCreature): boolean {
  if (creature.hasAttackedThisTurn) return false;
  const hasRush = creature.keywords.has("Rush") || creature.tempKeywords.has("Rush");
  return creature.summonedOnTurn !== state.turnNumber || hasRush;
}

/**
 * Among the enemy's non-Stealthed creatures, find the best "clean kill" for
 * this attacker: one it can kill outright (attack >= target health) without
 * dying itself (target's effective attack < this attacker's current health).
 * Ties/multiple options are broken by highest effective attack — removing
 * the biggest future threat first.
 */
function findCleanKillTarget(
  state: MatchState,
  playerId: PlayerId,
  attackerSlot: number,
): number | undefined {
  const enemyId = enemyOf(playerId);
  const enemyBoard = state.players[enemyId].board;
  const myAttack = getEffectiveAttack(state, playerId, attackerSlot);
  const myHealth = state.players[playerId].board[attackerSlot]!.health;

  let best: { slot: number; enemyAttack: number } | undefined;
  for (let slot = 0; slot < BOARD_SIZE; slot++) {
    const enemyCreature = enemyBoard[slot];
    if (!enemyCreature || enemyCreature.stealthed) continue;
    const enemyAttack = getEffectiveAttack(state, enemyId, slot);
    const canKill = myAttack >= enemyCreature.health;
    const survives = enemyAttack < myHealth;
    if (!canKill || !survives) continue;
    if (!best || enemyAttack > best.enemyAttack) {
      best = { slot, enemyAttack };
    }
  }
  return best?.slot;
}

function attackWithBoard(state: MatchState, playerId: PlayerId) {
  const enemyId = enemyOf(playerId);

  const eligibleAttack = state.players[playerId].board.reduce((sum, creature, slot) => {
    if (!creature || !canAttackThisTurn(state, creature)) return sum;
    return sum + getEffectiveAttack(state, playerId, slot);
  }, 0);
  const lethalAvailable = eligibleAttack >= state.players[enemyId].hp;

  for (let slot = 0; slot < BOARD_SIZE; slot++) {
    if (!state.players[playerId].board[slot]) continue;
    const enemyGuardSlot = state.players[enemyId].board.findIndex(
      (c) => c && (c.keywords.has("Guard") || c.tempKeywords.has("Guard")),
    );

    let target: TargetRef;
    if (enemyGuardSlot !== -1) {
      // A Guard is up — combat.ts requires every attack target it, no choice to make.
      target = { type: "creature", playerId: enemyId, slot: enemyGuardSlot };
    } else if (lethalAvailable) {
      // Going face with everyone wins this turn — don't waste attacks trading.
      target = { type: "player", playerId: enemyId };
    } else {
      const cleanKillSlot = findCleanKillTarget(state, playerId, slot);
      target =
        cleanKillSlot !== undefined
          ? { type: "creature", playerId: enemyId, slot: cleanKillSlot }
          : { type: "player", playerId: enemyId };
    }

    tryIntent(state, { kind: "attack", playerId, attackerSlot: slot, target });
  }
}

/**
 * Greedy-but-not-dumb heuristic opponent: plays whatever it can afford
 * (biggest first, to spend energy chunks efficiently), preferring slots that
 * trigger its own aura synergies; attacks face when that's lethal or no good
 * trade exists, otherwise takes the best clean kill available. Still not a
 * full strategy AI — a permanent solo/offline opponent and engine smoke test,
 * kept fast, synchronous, and free of any randomness of its own.
 */
export function takeBotTurn(state: MatchState, playerId: PlayerId) {
  playAffordableCards(state, playerId);
  attackWithBoard(state, playerId);
  tryIntent(state, { kind: "endTurn", playerId });
}
