export type EditionType = "standard" | "full_art" | "ultra" | "secret";

/** Shared label/icon for the three non-Standard editions (collectibility.md §4/§8) — used
 * everywhere a card instance's edition needs a human-readable badge: the live card frame itself,
 * the per-instance mint picker, and a pack reveal that happened to roll one (session 40 — a rare
 * secondary roll on a Legendary pull, not a separate guaranteed product anymore). */
export const EDITION_LABEL: Record<Exclude<EditionType, "standard">, string> = {
  full_art: "✨ Full Art",
  ultra: "🌟 Ultra",
  secret: "💎 Secret",
};

/** Same three tiers, plain text — for contexts (ARIA labels) that shouldn't carry an emoji. */
export const EDITION_NAME: Record<Exclude<EditionType, "standard">, string> = {
  full_art: "Full Art",
  ultra: "Ultra Edition",
  secret: "Secret Edition",
};

export function isSpecialEdition(editionType: EditionType | undefined): editionType is Exclude<EditionType, "standard"> {
  return editionType !== undefined && editionType !== "standard";
}
