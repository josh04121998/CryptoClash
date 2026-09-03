import { CARD_POOL } from "./cards.js";
import { checkWin, isTargetable, pushLog, removeIfDead } from "./matchOps.js";
import { getEffectiveAttack } from "./stats.js";
import { Intent, MatchState } from "./types.js";
import { enemyOf } from "./util.js";

export function resolveAttack(state: MatchState, intent: Extract<Intent, { kind: "attack" }>) {
  const attackerId = intent.playerId;
  const defenderId = enemyOf(attackerId);
  const attackerPlayer = state.players[attackerId];
  const defenderPlayer = state.players[defenderId];

  const attacker = attackerPlayer.board[intent.attackerSlot];
  if (!attacker) throw new Error("No creature in that slot.");
  if (attacker.hasAttackedThisTurn) throw new Error("That creature has already attacked this turn.");

  const hasRush = attacker.keywords.has("Rush") || attacker.tempKeywords.has("Rush");
  if (attacker.summonedOnTurn === state.turnNumber && !hasRush) {
    throw new Error("That creature was just summoned and cannot attack yet.");
  }

  if (!isTargetable(state, intent.target)) {
    throw new Error("That creature is Stealthed and cannot be targeted.");
  }

  const enemyGuardSlots = defenderPlayer.board
    .map((c, i) => (c && (c.keywords.has("Guard") || c.tempKeywords.has("Guard")) ? i : -1))
    .filter((i) => i !== -1);

  if (intent.target.type === "player") {
    if (enemyGuardSlots.length > 0) {
      throw new Error("Enemy has a Guard creature — it must be attacked first.");
    }
  } else {
    const defender = defenderPlayer.board[intent.target.slot];
    if (!defender) throw new Error("No creature at the target slot.");
    if (enemyGuardSlots.length > 0 && !enemyGuardSlots.includes(intent.target.slot)) {
      throw new Error("Enemy has a Guard creature — it must be attacked first.");
    }
  }

  const attackDamage = getEffectiveAttack(state, attackerId, intent.attackerSlot);
  attacker.hasAttackedThisTurn = true;
  if (attacker.stealthed) {
    attacker.stealthed = false;
    pushLog(state, `${CARD_POOL[attacker.templateId].name} is revealed.`);
  }

  if (intent.target.type === "player") {
    defenderPlayer.hp -= attackDamage;
    pushLog(
      state,
      `${CARD_POOL[attacker.templateId].name} attacks ${defenderId} for ${attackDamage} (HP: ${defenderPlayer.hp}).`,
    );
    checkWin(state);
    return;
  }

  const defenderSlot = intent.target.slot;
  const defender = defenderPlayer.board[defenderSlot]!;
  const defenderDamage = getEffectiveAttack(state, defenderId, defenderSlot);

  defender.health -= attackDamage;
  attacker.health -= defenderDamage;
  pushLog(
    state,
    `${CARD_POOL[attacker.templateId].name} (slot ${intent.attackerSlot + 1}) trades with ${CARD_POOL[defender.templateId].name} (slot ${defenderSlot + 1}): ${attackDamage} <-> ${defenderDamage} damage.`,
  );

  removeIfDead(state, attackerId, intent.attackerSlot);
  removeIfDead(state, defenderId, defenderSlot);
}
