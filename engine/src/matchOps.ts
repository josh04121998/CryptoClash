import { CARD_POOL } from "./cards.js";
import { MatchState, PlayerId, TargetRef } from "./types.js";

/**
 * Low-level, dependency-free operations shared by effects.ts, combat.ts,
 * burn.ts and marketEvents.ts. Kept separate so those modules can call each
 * other's higher-level entry points without a circular import.
 */

export function pushLog(state: MatchState, text: string) {
  state.log.push({ turn: state.turnNumber, text });
}

export function removeIfDead(state: MatchState, playerId: PlayerId, slot: number) {
  const creature = state.players[playerId].board[slot];
  if (creature && creature.health <= 0) {
    pushLog(state, `${CARD_POOL[creature.templateId].name} (${playerId}, slot ${slot + 1}) dies.`);
    state.players[playerId].board[slot] = null;
    state.pendingDeathrattles.push({ controller: playerId, templateId: creature.templateId, silenced: creature.silenced });
  }
}

export function checkWin(state: MatchState) {
  const aDead = state.players.A.hp <= 0;
  const bDead = state.players.B.hp <= 0;
  if (aDead && bDead) state.winner = "Draw";
  else if (aDead) state.winner = "B";
  else if (bDead) state.winner = "A";
}

export function applyDamageToTarget(state: MatchState, target: TargetRef, amount: number) {
  if (target.type === "player") {
    const player = state.players[target.playerId];
    player.hp -= amount;
    pushLog(state, `${target.playerId} takes ${amount} damage (HP: ${player.hp}).`);
    checkWin(state);
  } else {
    const creature = state.players[target.playerId].board[target.slot];
    if (!creature) return;
    creature.health -= amount;
    pushLog(
      state,
      `${CARD_POOL[creature.templateId].name} (${target.playerId}, slot ${target.slot + 1}) takes ${amount} damage.`,
    );
    removeIfDead(state, target.playerId, target.slot);
  }
}

/**
 * Stealth (batlleSpec.md Section 13): a stealthed creature can't be
 * explicitly chosen as a target. Board-wide/automatic effects (Market
 * Events picking "the strongest creature") bypass this deliberately — only
 * player-chosen targeting (a spell's target, an attack's target) is
 * restricted.
 */
export function isTargetable(state: MatchState, target: TargetRef): boolean {
  if (target.type !== "creature") return true;
  const creature = state.players[target.playerId].board[target.slot];
  return !creature?.stealthed;
}
