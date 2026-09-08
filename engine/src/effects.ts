import { CARD_POOL } from "./cards.js";
import { drawCard } from "./draw.js";
import { applyVolatilityChange } from "./marketEvents.js";
import { applyDamageToTarget, pushLog } from "./matchOps.js";
import {
  BoardCreature,
  EffectDef,
  Keyword,
  MatchState,
  MAX_ENERGY,
  MAX_PLAYER_HP,
  PlayerId,
  TargetRef,
  TargetSelector,
  Trigger,
} from "./types.js";
import { enemyOf, firstEmptySlot } from "./util.js";

export interface EffectContext {
  controller: PlayerId;
  /** Board slot of the creature that owns this effect, when applicable. */
  sourceSlot?: number;
  /** Player-chosen target, required when an effect's selector is "chosen". */
  chosenTarget?: TargetRef;
  /** Secret-only — the creature that caused this Secret to fire (see TargetSelector's "triggerSource"). */
  triggerSource?: TargetRef;
}

function resolveTargets(selector: TargetSelector, ctx: EffectContext): TargetRef[] {
  if (selector.kind === "enemyPlayer") {
    return [{ type: "player", playerId: enemyOf(ctx.controller) }];
  }
  if (selector.kind === "selfPlayer") {
    return [{ type: "player", playerId: ctx.controller }];
  }
  if (selector.kind === "triggerSource") {
    return ctx.triggerSource ? [ctx.triggerSource] : [];
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
    silenced: false,
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
      case "heal": {
        const player = state.players[ctx.controller];
        const before = player.hp;
        player.hp = Math.min(MAX_PLAYER_HP, player.hp + action.amount);
        pushLog(state, `${ctx.controller} heals ${player.hp - before} (HP: ${player.hp}).`);
        break;
      }
      case "gainEnergy": {
        const player = state.players[ctx.controller];
        player.energy = Math.min(MAX_ENERGY, player.energy + action.amount);
        pushLog(state, `${ctx.controller} gains ${action.amount} Energy this turn (Energy ${player.energy}).`);
        break;
      }
      case "gainMaxEnergy": {
        const player = state.players[ctx.controller];
        player.maxEnergy = Math.min(MAX_ENERGY, player.maxEnergy + action.amount);
        player.energy = Math.min(MAX_ENERGY, player.energy + action.amount);
        pushLog(
          state,
          `${ctx.controller}'s max Energy grows by ${action.amount} (Energy ${player.energy}/${player.maxEnergy}).`,
        );
        break;
      }
      case "buffTarget": {
        for (const target of resolveTargets(action.target, ctx)) {
          if (target.type !== "creature") continue;
          const creature = state.players[target.playerId].board[target.slot];
          if (!creature) continue;
          creature.buffAttack += action.attack ?? 0;
          if (action.health) {
            creature.buffHealth += action.health;
            creature.health += action.health;
            creature.maxHealth += action.health;
          }
          pushLog(
            state,
            `${CARD_POOL[creature.templateId].name} (${target.playerId}, slot ${target.slot + 1}) gains +${action.attack ?? 0}/+${action.health ?? 0}.`,
          );
        }
        break;
      }
      case "grantKeywordTarget": {
        for (const target of resolveTargets(action.target, ctx)) {
          if (target.type !== "creature") continue;
          const creature = state.players[target.playerId].board[target.slot];
          if (!creature) continue;
          creature.tempKeywords.add(action.keyword);
          pushLog(
            state,
            `${CARD_POOL[creature.templateId].name} (${target.playerId}, slot ${target.slot + 1}) gains ${action.keyword} this turn.`,
          );
        }
        break;
      }
      case "silence": {
        for (const target of resolveTargets(action.target, ctx)) {
          if (target.type !== "creature") continue;
          const creature = state.players[target.playerId].board[target.slot];
          if (!creature) continue;
          creature.keywords.clear();
          creature.tempKeywords.clear();
          creature.silenced = true;
          pushLog(state, `${CARD_POOL[creature.templateId].name} (${target.playerId}, slot ${target.slot + 1}) is silenced.`);
        }
        break;
      }
    }
  }
}

/**
 * Drains `state.pendingDeathrattles` (matchOps.ts's `removeIfDead` queues
 * onto it), firing each dead creature's `onDeath` effects — looped, not a
 * single pass, so a Deathrattle that kills a second Deathrattle creature
 * chains correctly. Called once, at the end of every `applyIntent`
 * (engine.ts) — every death path (combat, spell/burn damage, a Market
 * Event) funnels through `removeIfDead`, so this one call site covers all
 * of them regardless of how the creature died.
 */
export function processPendingDeathrattles(state: MatchState) {
  while (state.pendingDeathrattles.length > 0) {
    const { controller, templateId, silenced } = state.pendingDeathrattles.shift()!;
    if (silenced) continue;
    const template = CARD_POOL[templateId];
    if (template.effects) {
      resolveEffects(state, template.effects, "onDeath", { controller });
    }
  }
}

/**
 * Checks `reactingPlayerId`'s armed Secrets (card-schema.md Section 8) for
 * one whose template has an effect on `trigger`, fires the first match,
 * removes it from the zone, and logs a reveal — a no-op if none match. Only
 * one secret reacts per event in this pass (not a full chain-reveal system).
 */
export function checkAndFireSecret(state: MatchState, reactingPlayerId: PlayerId, trigger: Trigger, triggerSource: TargetRef) {
  const secrets = state.players[reactingPlayerId].secrets;
  for (let i = 0; i < secrets.length; i++) {
    const template = CARD_POOL[secrets[i]];
    const matching = template.effects?.find((e) => e.trigger === trigger);
    if (matching) {
      secrets.splice(i, 1);
      pushLog(state, `${reactingPlayerId}'s secret is revealed: ${template.name}!`);
      resolveEffects(state, template.effects!, trigger, { controller: reactingPlayerId, triggerSource });
      return;
    }
  }
}

export { createBoardCreature };
