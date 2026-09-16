import moonDog from "./assets/cards/moon_dog.jpg";
import fastFang from "./assets/cards/fast_fang.jpg";
import pupScout from "./assets/cards/pup_scout.jpg";
import shieldPup from "./assets/cards/shield_pup.jpg";
import puppySwarm from "./assets/cards/puppy_swarm.jpg";
import packRush from "./assets/cards/pack_rush.jpg";
import guardDog from "./assets/cards/guard_dog.jpg";
import loyalHound from "./assets/cards/loyal_hound.jpg";
import alphaDog from "./assets/cards/alpha_dog.jpg";
import shadowPup from "./assets/cards/shadow_pup.jpg";

/**
 * templateId -> illustration. Sparse on purpose — branding.md Section 9's art
 * pass is a slow background task (Grok generation limits), so most cards have
 * no entry yet and CardFace falls back to its CSS placeholder glow. Standard
 * edition only for now; Foil is a pure CSS effect over this same art (never a
 * separate asset), Full Art/1st Edition are a future separate generation pass.
 *
 * Doggos faction complete as of grok-card-prompts.md (10/10 real templates —
 * Puppy is a summon-only token, lowest generation priority, still unart'd).
 */
const CARD_ART: Partial<Record<string, string>> = {
  moon_dog: moonDog,
  fast_fang: fastFang,
  pup_scout: pupScout,
  shield_pup: shieldPup,
  puppy_swarm: puppySwarm,
  pack_rush: packRush,
  guard_dog: guardDog,
  loyal_hound: loyalHound,
  alpha_dog: alphaDog,
  shadow_pup: shadowPup,
};

export function cardArt(templateId: string): string | undefined {
  return CARD_ART[templateId];
}
