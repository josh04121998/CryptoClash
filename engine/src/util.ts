import { BOARD_SIZE, CardTemplate, PlayerId } from "./types.js";

export function enemyOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

export function getAdjacentSlots(slot: number): number[] {
  return [slot - 1, slot + 1].filter((s) => s >= 0 && s < BOARD_SIZE);
}

export function firstEmptySlot<T>(board: (T | null)[]): number {
  return board.findIndex((c) => c === null);
}

/**
 * Whether this card's onPlay "chosen" target is meant to be a creature you
 * control (Items — buffTarget/grantKeywordTarget) rather than the opponent's
 * side (damage/burn spells). Shared by the client's targeting UI and the bot
 * so both point a card at the right side of the board.
 */
export function targetsFriendlyCreature(template: CardTemplate): boolean {
  return Boolean(
    template.effects?.some(
      (e) =>
        e.trigger === "onPlay" &&
        e.requiresTarget &&
        (e.action.kind === "buffTarget" || e.action.kind === "grantKeywordTarget"),
    ),
  );
}
