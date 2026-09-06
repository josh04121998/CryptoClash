export const BOARD_SIZE = 5;
export const MAX_ENERGY = 10;
export const MAX_PLAYER_HP = 30;

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

/**
 * Collectible rarity tier (spec.md Section 13) — drives pack odds and scarcity
 * once packs exist (STATUS.md roadmap step 5). Distinct from `edition_type` in
 * the DB (standard/first_edition/legendary/genesis, architecture.md Section 6),
 * which is a cosmetic variant *of* a template — a template's rarity here stays
 * fixed while its editions can vary. Mythic and Genesis are reserved for future,
 * more scarce content — no current template pool card uses them.
 */
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic" | "Genesis";

/** Launch keyword vocabulary (batlleSpec.md, Section 11). */
export type Keyword = "Rush" | "Guard" | "Stealth" | "Burn" | "HODL";

export type TargetSelector = { kind: "enemyPlayer" } | { kind: "selfPlayer" } | { kind: "chosen" };

export type EffectAction =
  | { kind: "damage"; target: TargetSelector; amount: number }
  | { kind: "summon"; templateId: string; count: number }
  | { kind: "buffSelf"; attack?: number; health?: number }
  | { kind: "grantKeywordFriendlyBoard"; keyword: Keyword }
  /** Section 16/17/18: shared meter, clamped [0,10]; reaching 10 triggers a Market Event and resets it. */
  | { kind: "volatility"; amount: number }
  /** Section 14: ongoing damage — amountPerTurn damage at the end of every turn, for `turns` turns. */
  | { kind: "burn"; target: TargetSelector; amountPerTurn: number; turns: number }
  /** Controller draws `count` cards (Builders faction signature — card advantage/combo enabler). */
  | { kind: "draw"; count: number }
  /** Frogs faction signature — summons a copy of `count` random *other* friendly creatures into empty slots; fizzles (per-copy) if there's no source or no room. */
  | { kind: "copyRandomFriendly"; count: number }
  /** Normies faction signature — controller's own player gains `amount` HP, clamped to MAX_PLAYER_HP. */
  | { kind: "heal"; amount: number }
  /** CryptoBros faction signature — controller gains `amount` Energy immediately this turn, clamped to MAX_ENERGY (doesn't raise maxEnergy). */
  | { kind: "gainEnergy"; amount: number }
  /** CryptoBros faction signature — controller's maxEnergy (and current energy) permanently increases by `amount`, clamped to MAX_ENERGY. */
  | { kind: "gainMaxEnergy"; amount: number }
  /** Items' "permanent upgrade" flavor — permanently buffs whatever creature `target` resolves to (no-op if it resolves to a player). */
  | { kind: "buffTarget"; target: TargetSelector; attack?: number; health?: number }
  /** Items' "temporary upgrade" flavor — grants `keyword` to whatever creature `target` resolves to until its owner's next startTurn (no-op if it resolves to a player). */
  | { kind: "grantKeywordTarget"; target: TargetSelector; keyword: Keyword };

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
  /** Absent only for tokens (summon-only, never deck-legal — see `token` below). */
  rarity?: Rarity;
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
