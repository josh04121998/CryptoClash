import { applyIntent, CARD_POOL, Intent, MatchState, PlayerId } from "@cryptoclash/engine";

/**
 * Scripted Doggos coach bot — fixed intents, NOT the full greedy AI.
 * Turn plan (B's turns):
 *  1st B turn: play a cheap pup, no big swings
 *  2nd B turn: play exactly one Guard (shield_pup), soft face poke if legal
 *  Later: play cheap cards only; never lethal the player early
 */

function tryIntent(state: MatchState, intent: Intent): boolean {
  try {
    applyIntent(state, intent);
    return true;
  } catch {
    return false;
  }
}

function emptySlot(state: MatchState, playerId: PlayerId): number {
  return state.players[playerId].board.findIndex((c) => c === null);
}

function handIndexOf(state: MatchState, playerId: PlayerId, templateId: string): number {
  return state.players[playerId].hand.indexOf(templateId);
}

function playFirstAffordable(state: MatchState, playerId: PlayerId, preferIds: string[]): boolean {
  const player = state.players[playerId];
  for (const id of preferIds) {
    const idx = handIndexOf(state, playerId, id);
    if (idx === -1) continue;
    const template = CARD_POOL[id];
    if (template.cost > player.energy) continue;
    if (template.type === "Creature") {
      const slot = emptySlot(state, playerId);
      if (slot === -1) continue;
      if (tryIntent(state, { kind: "playCard", playerId, handIndex: idx, slot })) return true;
    } else if (!template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget)) {
      if (tryIntent(state, { kind: "playCard", playerId, handIndex: idx })) return true;
    }
  }
  return false;
}

function botTurnIndex(state: MatchState): number {
  return state.log.filter((e) => e.text.includes("B ends their turn")).length;
}

function softAttack(state: MatchState, playerId: PlayerId) {
  const enemyId: PlayerId = playerId === "A" ? "B" : "A";
  if (state.players[enemyId].hp <= 12) return;
  for (let slot = 0; slot < state.players[playerId].board.length; slot++) {
    const c = state.players[playerId].board[slot];
    if (!c || c.hasAttackedThisTurn) continue;
    const hasRush = c.keywords.has("Rush") || c.tempKeywords.has("Rush");
    if (c.summonedOnTurn === state.turnNumber && !hasRush) continue;
    tryIntent(state, {
      kind: "attack",
      playerId,
      attackerSlot: slot,
      target: { type: "player", playerId: enemyId },
    });
    break;
  }
}

export function takeTutorialBotTurn(state: MatchState, playerId: PlayerId = "B") {
  if (!state.tutorial) {
    throw new Error("takeTutorialBotTurn requires tutorial: true");
  }
  const turnIdx = botTurnIndex(state);

  if (turnIdx === 0) {
    playFirstAffordable(state, playerId, ["pup_scout", "fast_fang"]);
    tryIntent(state, { kind: "endTurn", playerId });
    return;
  }

  if (turnIdx === 1) {
    const playedGuard =
      playFirstAffordable(state, playerId, ["shield_pup"]) ||
      playFirstAffordable(state, playerId, ["guard_dog"]);
    if (!playedGuard) {
      playFirstAffordable(state, playerId, ["moon_dog", "pup_scout"]);
    }
    softAttack(state, playerId);
    tryIntent(state, { kind: "endTurn", playerId });
    return;
  }

  playFirstAffordable(state, playerId, ["pup_scout", "fast_fang", "puppy_swarm"]);
  softAttack(state, playerId);
  tryIntent(state, { kind: "endTurn", playerId });
}
