import { CARD_POOL } from "./cards.js";
import { applyIntent } from "./engine.js";
import { getEffectiveAttack } from "./stats.js";
import { BOARD_SIZE, BoardCreature, CardTemplate, Intent, MatchState, MAX_PLAYER_HP, PlayerId, TargetRef } from "./types.js";
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

/** Total effective attack of everything on `playerId`'s board still eligible to attack this turn. */
function currentEligibleAttack(state: MatchState, playerId: PlayerId): number {
  return state.players[playerId].board.reduce((sum, creature, slot) => {
    if (!creature || !canAttackThisTurn(state, creature)) return sum;
    return sum + getEffectiveAttack(state, playerId, slot);
  }, 0);
}

/** Total effective attack sitting on `enemyId`'s board right now — the bot's proxy for "how hard could the enemy swing back next turn." */
function enemyBoardThreat(state: MatchState, enemyId: PlayerId): number {
  return state.players[enemyId].board.reduce((sum, creature, slot) => {
    if (!creature) return sum;
    return sum + getEffectiveAttack(state, enemyId, slot);
  }, 0);
}

/** Sum of a template's `onPlay` `damage` effects aimed at its own controller (Degens' signature "pay HP for power" cost). */
function onPlaySelfDamage(template: CardTemplate): number {
  return (template.effects ?? [])
    .filter((e) => e.trigger === "onPlay" && e.action.kind === "damage" && e.action.target.kind === "selfPlayer")
    .reduce((sum, e) => sum + (e.action as { kind: "damage"; amount: number }).amount, 0);
}

/** Sum of a template's `onPlay` `damage` effects aimed straight at the enemy player's face (not a creature). */
function onPlayFaceDamage(template: CardTemplate): number {
  return (template.effects ?? [])
    .filter((e) => e.trigger === "onPlay" && e.action.kind === "damage" && e.action.target.kind === "enemyPlayer")
    .reduce((sum, e) => sum + (e.action as { kind: "damage"; amount: number }).amount, 0);
}

/**
 * Flat floor below which the bot won't voluntarily pay its own HP, absent a
 * compelling reason to anyway — roughly a quarter of max HP. Tuned empirically
 * against the bot-vs-bot win-rate sweep (see STATUS.md session 16/this
 * session): much lower (e.g. 6) under-protects, much higher (e.g. 15) makes
 * the bot too timid to actually use Degens' signature payoff and *reduces*
 * its win rate versus this floor — this sits near the sweep's observed peak.
 */
const SELF_DAMAGE_SAFE_HP_FLOOR = Math.round(MAX_PLAYER_HP * 0.25);

/**
 * Session-16 balance-pass finding: the bot had no model at all for the risk
 * in Degens' signature "pay your own HP for power/tempo" cards — it played
 * them purely greedily, sometimes walking itself into (or well past) the
 * enemy's next-turn lethal range for a stat/tempo gain that didn't matter
 * because the game was about to end anyway. This is the fix: a self-damage
 * card is "too risky" when playing it would leave the bot at or below a flat
 * safety floor, *or* at or below the enemy board's current full-swing attack
 * total (i.e. voluntarily stepping into next-turn lethal range) — unless the
 * card's own direct face damage, stacked on everything already able to
 * attack this turn, would close out the game outright, in which case the HP
 * risk is moot because the match ends before the enemy ever gets to swing
 * back. Doesn't need to be optimal — just no longer blind to the risk.
 */
function isSelfDamageTooRisky(state: MatchState, playerId: PlayerId, template: CardTemplate): boolean {
  const selfDamage = onPlaySelfDamage(template);
  if (selfDamage <= 0) return false;

  const enemyId = enemyOf(playerId);
  const projectedHp = state.players[playerId].hp - selfDamage;
  const dangerous = projectedHp <= SELF_DAMAGE_SAFE_HP_FLOOR || projectedHp <= enemyBoardThreat(state, enemyId);
  if (!dangerous) return false;

  const wouldBeLethal = currentEligibleAttack(state, playerId) + onPlayFaceDamage(template) >= state.players[enemyId].hp;
  return !wouldBeLethal;
}

function playAffordableCards(state: MatchState, playerId: PlayerId) {
  let progressed = true;
  while (progressed) {
    progressed = false;
    const player = state.players[playerId];
    for (const i of playOrder(player.hand)) {
      const template = CARD_POOL[player.hand[i]];
      if (template.cost > player.energy) continue;
      if (isSelfDamageTooRisky(state, playerId, template)) continue;

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
  const lethalAvailable = currentEligibleAttack(state, playerId) >= state.players[enemyId].hp;

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
