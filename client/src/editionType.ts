export type EditionType = "standard" | "full_art" | "ultra" | "secret";

/** Shared label/icon for the three non-Standard editions (Founders Set only — see
 * collectibility.md §4/§8) — used everywhere a card instance's edition needs a human-readable
 * badge: the live card frame itself, the per-instance mint picker, and the Founders Set reveal. */
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
