import { CARD_POOL } from "./cards.js";
import { BoardCreature, EffectDef, Keyword, MatchState, PlayerId, TargetRef, TargetSelector, Trigger } from "./types.js";
import { enemyOf, firstEmptySlot } from "./util.js";

export interface EffectContext {
  controller: PlayerId;
  /** Board slot of the creature that owns this effect, when applicable. */
  sourceSlot?: number;
  /** Player-chosen target, required when an effect's selector is "chosen". */
  chosenTarget?: TargetRef;
}

function pushLog(state: MatchState, text: string) {
  state.log.push({ turn: state.turnNumber, text });
}

function resolveTargets(selector: TargetSelector, ctx: EffectContext): TargetRef[] {
  if (selector.kind === "enemyPlayer") {
    return [{ type: "player", playerId: enemyOf(ctx.controller) }];
  }
  // "chosen" — validated as present by the caller before effects run.
  return ctx.chosenTarget ? [ctx.chosenTarget] : [];
}

export function removeIfDead(state: MatchState, playerId: PlayerId, slot: number) {
  const creature = state.players[playerId].board[slot];
  if (creature && creature.health <= 0) {
    pushLog(state, `${CARD_POOL[creature.templateId].name} (${playerId}, slot ${slot + 1}) dies.`);
    state.players[playerId].board[slot] = null;
  }
}

export function checkWin(state: MatchState) {
  const aDead = state.players.A.hp <= 0;
  const bDead = state.players.B.hp <= 0;
  if (aDead && bDead) state.winner = "Draw";
  else if (aDead) state.winner = "B";
  else if (bDead) state.winner = "A";
}

function applyDamage(state: MatchState, target: TargetRef, amount: number) {
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

export function resolveEffects(state: MatchState, effects: EffectDef[], trigger: Trigger, ctx: EffectContext) {
  for (const effect of effects) {
    if (effect.trigger !== trigger) continue;
    const action = effect.action;
    switch (action.kind) {
      case "damage": {
        for (const target of resolveTargets(action.target, ctx)) {
          applyDamage(state, target, action.amount);
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
    }
  }
}

export { createBoardCreature };
