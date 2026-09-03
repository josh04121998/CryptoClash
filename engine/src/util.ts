import { BOARD_SIZE, PlayerId } from "./types.js";

export function enemyOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

export function getAdjacentSlots(slot: number): number[] {
  return [slot - 1, slot + 1].filter((s) => s >= 0 && s < BOARD_SIZE);
}

export function firstEmptySlot<T>(board: (T | null)[]): number {
  return board.findIndex((c) => c === null);
}
