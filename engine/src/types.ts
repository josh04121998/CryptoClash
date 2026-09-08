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

export type CardType = "Creature" | "Spell" | "Item" | "Secret";

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

export type TargetSelector =
  | { kind: "enemyPlayer" }
  | { kind: "selfPlayer" }
  | { kind: "chosen" }
  /** Secret-only (Section 8, card-schema.md) — resolves to whatever creature caused the Secret to fire: the attacker for onEnemyAttack, the just-played creature for onEnemyPlayCreature. Empty (no-op) outside a Secret's own trigger resolution. */
  | { kind: "triggerSource" };

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
  | { kind: "grantKeywordTarget"; target: TargetSelector; keyword: Keyword }
  /** Strips `keywords`/`tempKeywords` from `target` and marks it silenced (suppresses its own future onTurnStart/onDeath triggers and any aura it provides) — no-op if it resolves to a player. Deliberately doesn't retroactively undo stat buffs already applied (see card-schema.md) or heal it back to a lower max health, just shuts off what it *does* from here on. */
  | { kind: "silence"; target: TargetSelector };

/**
 * `onEnemyAttack`/`onEnemyPlayCreature` are Secret-only (CardType "Secret") —
 * see Section 8 of card-schema.md. They don't fire via the normal
 * `resolveEffects(..., trigger, ctx)` call sites the other triggers use;
 * combat.ts/engine.ts check the reacting player's `secrets` zone for a
 * matching trigger at the relevant moment instead.
 */
export type Trigger = "onPlay" | "onTurnStart" | "onDeath" | "onEnemyAttack" | "onEnemyPlayCreature";

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
  /** Set by the `silence` EffectAction — suppresses this creature's own onTurnStart/onDeath triggers and any aura it provides, going forward. Doesn't undo stats already gained. */
  silenced: boolean;
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
  /**
   * Armed Secret template ids, in play order (card-schema.md Section 8).
   * Known, pre-existing gap this doesn't fix: the network protocol
   * (shared/src/index.ts's serializeState) sends full MatchState to both
   * players already — hand and deck order are just as fully visible to an
   * opponent today as this array is. Secrets are mechanically real and
   * deterministic; they are not yet *cryptographically* hidden over the
   * wire, same as nothing else in this game is. See STATUS.md.
   */
  secrets: string[];
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
  /**
   * Queued by `removeIfDead` (matchOps.ts) whenever a creature dies, from
   * *any* death path (combat, spell/burn damage, a Market Event) — drained
   * by `processPendingDeathrattles` (effects.ts) at the end of every
   * `applyIntent`. Kept as a queue rather than firing inline from
   * `removeIfDead` to avoid a circular import (matchOps.ts is a dependency
   * of effects.ts, not the other way around) and so a Deathrattle that kills
   * a second Deathrattle creature chains correctly (drained in a loop, not a
   * single pass). Always empty by the time a MatchState is serialized for
   * the network — one full player action always finishes draining it.
   */
  pendingDeathrattles: { controller: PlayerId; templateId: string; silenced: boolean }[];
}
