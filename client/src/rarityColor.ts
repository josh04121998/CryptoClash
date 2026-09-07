import { Rarity } from "@cryptoclash/engine";

/** Placeholder mapping (same "not tuned, just a first pass" caveat as the rarity data itself — see STATUS.md). */
export function rarityColor(rarity: Rarity): string {
  switch (rarity) {
    case "Common":
      return "#9ca3af";
    case "Uncommon":
      return "#22c55e";
    case "Rare":
      return "#3b82f6";
    case "Epic":
      return "#a855f7";
    case "Legendary":
      return "#f59e0b";
    case "Mythic":
      return "#ec4899";
    case "Genesis":
      return "#facc15";
    default:
      return "#8a93ab";
  }
}
