import moonDog from "./assets/cards/moon_dog.jpg";

/**
 * templateId -> illustration. Sparse on purpose — branding.md Section 9's art
 * pass is a slow background task (Grok generation limits), so most cards have
 * no entry yet and CardFace falls back to its CSS placeholder glow. Standard
 * edition only for now; Foil is a pure CSS effect over this same art (never a
 * separate asset), Full Art/1st Edition are a future separate generation pass.
 */
const CARD_ART: Partial<Record<string, string>> = {
  moon_dog: moonDog,
};

export function cardArt(templateId: string): string | undefined {
  return CARD_ART[templateId];
}
