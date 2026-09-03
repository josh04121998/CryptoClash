import { CARD_POOL } from "./cards.js";
import { drawCard } from "./draw.js";
import { pushLog, removeIfDead } from "./matchOps.js";
import { getEffectiveAttack } from "./stats.js";
import { MatchState, PlayerId } from "./types.js";

/** batlleSpec.md Section 17. BLACK_SWAN excluded from its own random pool. */
export type MarketEventType = "MARKET_CRASH" | "PUMP" | "LIQUIDATION" | "FOMO" | "BLACK_SWAN";
const RANDOMIZABLE_EVENTS: MarketEventType[] = ["MARKET_CRASH", "PUMP", "LIQUIDATION", "FOMO"];

function strongestCreatureSlot(state: MatchState, playerId: PlayerId): number {
  let bestSlot = -1;
  let bestAttack = -1;
  state.players[playerId].board.forEach((creature, slot) => {
    if (!creature) return;
    const attack = getEffectiveAttack(state, playerId, slot);
    if (attack > bestAttack) {
      bestAttack = attack;
      bestSlot = slot;
    }
  });
  return bestSlot;
}

function marketCrash(state: MatchState) {
  pushLog(state, "📉 MARKET CRASH — the strongest creature on each side takes 2 damage.");
  for (const playerId of ["A", "B"] as PlayerId[]) {
    const slot = strongestCreatureSlot(state, playerId);
    if (slot === -1) continue;
    const creature = state.players[playerId].board[slot]!;
    creature.health -= 2;
    pushLog(state, `${CARD_POOL[creature.templateId].name} (${playerId}, slot ${slot + 1}) takes 2 damage.`);
    removeIfDead(state, playerId, slot);
  }
}

function pump(state: MatchState) {
  pushLog(state, "📈 PUMP — all creatures gain +1 Attack this turn.");
  for (const playerId of ["A", "B"] as PlayerId[]) {
    for (const creature of state.players[playerId].board) {
      if (creature) creature.tempAttackBonus += 1;
    }
  }
}

function liquidation(state: MatchState) {
  pushLog(state, "💧 LIQUIDATION — both players lose 2 Energy next turn.");
  state.pendingEnergyPenalty.A += 2;
  state.pendingEnergyPenalty.B += 2;
}

function fomo(state: MatchState) {
  pushLog(state, "🚀 FOMO — both players draw a card.");
  drawCard(state, "A");
  drawCard(state, "B");
}

export function triggerMarketEvent(state: MatchState, type: MarketEventType) {
  switch (type) {
    case "MARKET_CRASH":
      marketCrash(state);
      return;
    case "PUMP":
      pump(state);
      return;
    case "LIQUIDATION":
      liquidation(state);
      return;
    case "FOMO":
      fomo(state);
      return;
    case "BLACK_SWAN": {
      pushLog(state, "🦅 BLACK SWAN — a random global effect occurs.");
      const picked = RANDOMIZABLE_EVENTS[Math.floor(state.rng() * RANDOMIZABLE_EVENTS.length)];
      triggerMarketEvent(state, picked);
      return;
    }
  }
}

const ALL_EVENTS: MarketEventType[] = [...RANDOMIZABLE_EVENTS, "BLACK_SWAN"];

/** Clamps volatility into [0,10]; reaching (or overshooting past) 10 fires a random Market Event and resets it to 0. */
export function applyVolatilityChange(state: MatchState, amount: number) {
  state.volatility = Math.max(0, Math.min(10, state.volatility + amount));
  pushLog(state, `Volatility ${amount >= 0 ? "rises" : "falls"} to ${state.volatility}/10.`);

  if (state.volatility >= 10) {
    pushLog(state, "Volatility reaches 10!");
    const picked = ALL_EVENTS[Math.floor(state.rng() * ALL_EVENTS.length)];
    triggerMarketEvent(state, picked);
    state.volatility = 0;
    pushLog(state, "Volatility resets to 0/10.");
  }
}
