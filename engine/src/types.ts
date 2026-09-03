export const BOARD_SIZE = 5;

export type PlayerId = "A" | "B";

export type Faction =
  | "Doggos"
  | "Frogs"
  | "Degens"
  | "CryptoBros"
  | "Builders"
  | "Normies"
  | "Neutral";

export type CardType = "Creature" | "Spell" | "Item";

/** Launch keyword vocabulary (batlleSpec.md, Section 11). */
export type Keyword = "Rush" | "Guard" | "Stealth" | "Burn" | "HODL";

export type TargetSelector = { kind: "enemyPlayer" } | { kind: "chosen" };

export type EffectAction =
  | { kind: "damage"; target: TargetSelector; amount: number }
  | { kind: "summon"; templateId: string; count: number }
  | { kind: "buffSelf"; attack?: number; health?: number }
  | { kind: "grantKeywordFriendlyBoard"; keyword: Keyword }
  /** Section 16/17/18: shared meter, clamped [0,10]; reaching 10 triggers a Market Event and resets it. */
  | { kind: "volatility"; amount: number }
  /** Section 14: ongoing damage — amountPerTurn damage at the end of every turn, for `turns` turns. */
  | { kind: "burn"; target: TargetSelector; amountPerTurn: number; turns: number };

export type Trigger = "onPlay" | "onTurnStart";

export interface EffectDef {
  trigger: Trigger;
  action: EffectAction;
  /** Whether playing this card requires the caller to supply Intent.target. */
  requiresTarget?: boolean;
}

/** Continuous stat buff applied to matching board creatures while the source is alive. */
export interface AuraDef {
  filter: "adjacentSameFaction";
  attack?: number;
  health?: number;
}

export interface CardTemplate {
  id: string;
  name: string;
  faction: Faction;
  type: CardType;
  cost: number;
  attack?: number;
  health?: number;
  keywords?: Keyword[];
  effects?: EffectDef[];
  aura?: AuraDef;
  text: string;
  /** Tokens aren't obtainable via deck construction, only summoned by effects. */
  token?: boolean;
}

export interface BoardCreature {
  instanceId: number;
  templateId: string;
  baseAttack: number;
  health: number;
  maxHealth: number;
  keywords: Set<Keyword>;
  /** Keywords granted for the current turn only (e.g. Pack Rush), cleared on owner's next startTurn. */
  tempKeywords: Set<Keyword>;
  summonedOnTurn: number;
  hasAttackedThisTurn: boolean;
  /** Accumulated permanent buffs from effects like HODL. */
  buffAttack: number;
  buffHealth: number;
  /** Cleared on the owner's next startTurn — e.g. a Market Event's PUMP. */
  tempAttackBonus: number;
  /** True while a Stealth creature is untargetable; cleared the moment it attacks (is "revealed"). */
  stealthed: boolean;
}

export type Board = (BoardCreature | null)[];

export interface PlayerState {
  id: PlayerId;
  hp: number;
  maxEnergy: number;
  energy: number;
  deck: string[];
  hand: string[];
  board: Board;
  fatigue: number;
}

export type TargetRef =
  | { type: "player"; playerId: PlayerId }
  | { type: "creature"; playerId: PlayerId; slot: number };

export type Intent =
  | { kind: "playCard"; playerId: PlayerId; handIndex: number; slot?: number; target?: TargetRef }
  | { kind: "attack"; playerId: PlayerId; attackerSlot: number; target: TargetRef }
  | { kind: "endTurn"; playerId: PlayerId };

export interface LogEntry {
  turn: number;
  text: string;
}

/** A ticking Burn instance — resolved at the end of every turn until turnsRemaining hits 0. */
export interface BurnStatus {
  target: TargetRef;
  amountPerTurn: number;
  turnsRemaining: number;
}

export interface MatchState {
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId;
  turnNumber: number;
  nextInstanceId: number;
  log: LogEntry[];
  winner: PlayerId | "Draw" | null;
  rng: () => number;
  /** Section 16-18: shared global meter, 0-10. */
  volatility: number;
  activeBurns: BurnStatus[];
  /** Section: LIQUIDATION Market Event — energy owed off a player's next startTurn. */
  pendingEnergyPenalty: Record<PlayerId, number>;
}
