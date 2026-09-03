import { Faction } from "@cryptoclash/engine";

export function factionColor(faction: Faction): string {
  switch (faction) {
    case "Doggos":
      return "#f5a623";
    case "Frogs":
      return "#4ade80";
    case "Degens":
      return "#ef4444";
    case "CryptoBros":
      return "#facc15";
    case "Builders":
      return "#60a5fa";
    case "Normies":
      return "#a3a3a3";
    default:
      return "#8a93ab";
  }
}
