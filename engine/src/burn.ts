import { CARD_POOL } from "./cards.js";
import { applyDamageToTarget, pushLog } from "./matchOps.js";
import { MatchState } from "./types.js";

function targetLabel(state: MatchState, status: MatchState["activeBurns"][number]): string {
  const { target } = status;
  if (target.type === "player") return target.playerId;
  const creature = state.players[target.playerId].board[target.slot];
  return creature ? `${CARD_POOL[creature.templateId].name} (${target.playerId}, slot ${target.slot + 1})` : "a since-departed target";
}

/** batlleSpec.md Section 14: resolved once at the end of every turn (either player's), regardless of who controls the burn. */
export function tickBurns(state: MatchState) {
  const stillActive: MatchState["activeBurns"] = [];
  for (const status of state.activeBurns) {
    if (status.target.type === "creature" && !state.players[status.target.playerId].board[status.target.slot]) {
      continue; // the creature is already gone — nothing left to burn
    }
    pushLog(state, `Burn deals ${status.amountPerTurn} damage to ${targetLabel(state, status)}.`);
    applyDamageToTarget(state, status.target, status.amountPerTurn);
    if (status.turnsRemaining > 1) stillActive.push({ ...status, turnsRemaining: status.turnsRemaining - 1 });
  }
  state.activeBurns = stillActive;
}
