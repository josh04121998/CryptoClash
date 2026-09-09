/**
 * Fixed tutorial decks (ordered). Used with createMatch(..., { tutorial: true, preserveDeckOrder: true })
 * and a fixed seed so teaching beats fire reliably.
 *
 * Player: Normies starter (heal/defend fantasy, readable).
 * Opponent: watered-down Doggos (swarm pressure + one Guard).
 */
export const TUTORIAL_SEED = 20260909;

/** Opening hand [0..3] then draw pile. Front-loaded with the 1-drop for beat 1. */
export const TUTORIAL_PLAYER_DECK: string[] = [
  "steady_hand",
  "first_aid",
  "safe_harbor",
  "rainy_day_fund",
  "steady_hand",
  "old_reliable",
  "adaptive_trader",
  "first_aid",
  "safe_harbor",
  "community_shield",
  "rainy_day_fund",
  "rocket_boots",
  "steady_hand",
  "old_reliable",
  "adaptive_trader",
  "reinforced_plating",
  "cool_down",
  "community_shield",
  "first_aid",
  "safe_harbor",
  "rainy_day_fund",
  "old_reliable",
  "adaptive_trader",
  "steadfast_normie",
  "rocket_boots",
  "cool_down",
  "reinforced_plating",
  "community_shield",
  "steadfast_normie",
  "stop_loss_order",
];

/**
 * Watered-down Doggos. Opening hand has a 1-drop; Guard (shield_pup) arrives
 * for the scripted coach turn after the player has practiced a face hit.
 */
export const TUTORIAL_BOT_DECK: string[] = [
  "pup_scout",
  "pup_scout",
  "shield_pup",
  "fast_fang",
  "shield_pup",
  "pup_scout",
  "puppy_swarm",
  "spark_bolt",
  "moon_dog",
  "guard_dog",
  "fast_fang",
  "pup_scout",
  "shield_pup",
  "pack_rush",
  "spark_bolt",
  "puppy_swarm",
  "moon_dog",
  "fast_fang",
  "pup_scout",
  "ember_curse",
  "cool_down",
  "pump_signal",
  "loyal_hound",
  "diamond_hands",
  "shadow_pup",
  "guard_dog",
  "puppy_swarm",
  "spark_bolt",
  "moon_dog",
  "alpha_dog",
];

/** Rush creature injected into the player's hand by turn 2 if deck order fails. */
export const TUTORIAL_RUSH_CARD = "fast_fang";
