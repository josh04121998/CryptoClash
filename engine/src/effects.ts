import { CARD_POOL } from "./cards.js";
import { drawCard } from "./draw.js";
import { applyVolatilityChange } from "./marketEvents.js";
import { applyDamageToTarget, pushLog } from "./matchOps.js";
import { BoardCreature, EffectDef, Keyword, MatchState, PlayerId, TargetRef, TargetSelector, Trigger } from "./types.js";
import { enemyOf, firstEmptySlot } from "./util.js";

export interface EffectContext {
  controller: PlayerId;
  /** Board slot of the creature that owns this effect, when applicable. */
  sourceSlot?: number;
  /** Player-chosen target, required when an effect's selector is "chosen". */
  chosenTarget?: TargetRef;
}

function resolveTargets(selector: TargetSelector, ctx: EffectContext): TargetRef[] {
  if (selector.kind === "enemyPlayer") {
    return [{ type: "player", playerId: enemyOf(ctx.controller) }];
  }
  // "chosen" — validated as present (and targetable) by the caller before effects run.
  return ctx.chosenTarget ? [ctx.chosenTarget] : [];
}

function createBoardCreature(state: MatchState, templateId: string): BoardCreature {
  const template = CARD_POOL[templateId];
  return {
    instanceId: state.nextInstanceId++,
    templateId: template.id,
    baseAttack: template.attack ?? 0,
    health: template.health ?? 0,
    maxHealth: template.health ?? 0,
    keywords: new Set(template.keywords ?? []),
    tempKeywords: new Set<Keyword>(),
    summonedOnTurn: state.turnNumber,
    hasAttackedThisTurn: false,
    buffAttack: 0,
    buffHealth: 0,
    tempAttackBonus: 0,
    stealthed: template.keywords?.includes("Stealth") ?? false,
  };
}

function summon(state: MatchState, controller: PlayerId, templateId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const slot = firstEmptySlot(state.players[controller].board);
    if (slot === -1) {
      pushLog(state, `${controller}'s board is full — remaining summon(s) fizzle.`);
      return;
    }
    state.players[controller].board[slot] = createBoardCreature(state, templateId);
    pushLog(state, `${controller} summons ${CARD_POOL[templateId].name} into slot ${slot + 1}.`);
  }
}

/**
 * Frogs faction signature. Each iteration picks a random *other* friendly creature
 * (excluding the source itself, when the effect belongs to a creature that's already
 * on the board) and creates a fresh copy of it — a new base-stat instance, same as
 * `summon`, not a snapshot of the original's current buffs/damage.
 */
function copyRandomFriendly(state: MatchState, ctx: EffectContext, count: number) {
  const board = state.players[ctx.controller].board;
  for (let i = 0; i < count; i++) {
    const candidates = board.filter(
      (creature, slot): creature is BoardCreature => creature !== null && slot !== ctx.sourceSlot,
    );
    if (candidates.length === 0) {
      pushLog(state, `${ctx.controller} has nothing to copy — the effect fizzles.`);
      return;
    }
    const targetSlot = firstEmptySlot(board);
    if (targetSlot === -1) {
      pushLog(state, `${ctx.controller}'s board is full — remaining copy effect(s) fizzle.`);
      return;
    }
    const source = candidates[Math.floor(state.rng() * candidates.length)];
    board[targetSlot] = createBoardCreature(state, source.templateId);
    pushLog(state, `${ctx.controller} copies ${CARD_POOL[source.templateId].name} into slot ${targetSlot + 1}.`);
  }
}

export function resolveEffects(state: MatchState, effects: EffectDef[], trigger: Trigger, ctx: EffectContext) {
  for (const effect of effects) {
    if (effect.trigger !== trigger) continue;
    const action = effect.action;
    switch (action.kind) {
      case "damage": {
        for (const target of resolveTargets(action.target, ctx)) {
          applyDamageToTarget(state, target, action.amount);
        }
        break;
      }
      case "summon": {
        summon(state, ctx.controller, action.templateId, action.count);
        break;
      }
      case "buffSelf": {
        if (ctx.sourceSlot === undefined) break;
        const creature = state.players[ctx.controller].board[ctx.sourceSlot];
        if (!creature) break;
        creature.buffAttack += action.attack ?? 0;
        if (action.health) {
          creature.buffHealth += action.health;
          creature.health += action.health;
          creature.maxHealth += action.health;
        }
        pushLog(
          state,
          `${CARD_POOL[creature.templateId].name} (${ctx.controller}, slot ${ctx.sourceSlot + 1}) gains +${action.attack ?? 0}/+${action.health ?? 0}.`,
        );
        break;
      }
      case "grantKeywordFriendlyBoard": {
        for (const creature of state.players[ctx.controller].board) {
          creature?.tempKeywords.add(action.keyword);
        }
        pushLog(state, `${ctx.controller}'s creatures gain ${action.keyword} this turn.`);
        break;
      }
      case "volatility": {
        applyVolatilityChange(state, action.amount);
        break;
      }
      case "burn": {
        for (const target of resolveTargets(action.target, ctx)) {
          state.activeBurns.push({ target, amountPerTurn: action.amountPerTurn, turnsRemaining: action.turns });
        }
        pushLog(state, `${ctx.controller} applies Burn (${action.amountPerTurn}/turn for ${action.turns} turns).`);
        break;
      }
      case "draw": {
        for (let i = 0; i < action.count; i++) drawCard(state, ctx.controller);
        break;
      }
      case "copyRandomFriendly": {
        copyRandomFriendly(state, ctx, action.count);
        break;
      }
    }
  }
}

export { createBoardCreature };
