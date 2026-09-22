import { Faction } from "@cryptoclash/engine";

export function factionColor(faction: Faction): string {
  switch (faction) {
    case "Doggos":
      return "#f5a623";
    case "Frogs":
      return "#4ade80";
    case "Apes":
      return "#ef4444";
    case "Bulls":
      return "#facc15";
    case "Bears":
      return "#60a5fa";
    case "Cats":
      // Deliberately not the old Normies grey (#a3a3a3). That hex was the root
      // cause of the faction's art reading as desaturated and miserable — every
      // prompt said "grey accent lighting", so nine scenes were lit grey
      // (saturation 68 against 126-188 everywhere else; grok-card-prompts.md v5).
      // Violet is the only hue not already claimed by another faction, and it
      // gives the cats the warm-subject-on-cool-field separation the Doggos have.
      return "#c084fc";
    default:
      return "#8a93ab";
  }
}
