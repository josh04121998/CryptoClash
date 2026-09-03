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

/** Launch keyword vocabulary (batlleSpec.md, Section 11). Stealth/Burn land in a later slice. */
export type Keyword = "Rush" | "Guard" | "HODL";

export type TargetSelector = { kind: "enemyPlayer" } | { kind: "chosen" };

export type EffectAction =
  | { kind: "damage"; target: TargetSelector; amount: number }
  | { kind: "summon"; templateId: string; count: number }
  | { kind: "buffSelf"; attack?: number; health?: number }
  | { kind: "grantKeywordFriendlyBoard"; keyword: Keyword };

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

export interface MatchState {
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId;
  turnNumber: number;
  nextInstanceId: number;
  log: LogEntry[];
  winner: PlayerId | "Draw" | null;
  rng: () => number;
}
