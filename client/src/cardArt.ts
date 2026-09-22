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
import leapFrog from "./assets/cards/leap_frog.jpg";
import wartyLookout from "./assets/cards/warty_lookout.jpg";
import frogSwarm from "./assets/cards/frog_swarm.jpg";
import stickyTongue from "./assets/cards/sticky_tongue.jpg";
import mimicFrog from "./assets/cards/mimic_frog.jpg";
import chaosCroak from "./assets/cards/chaos_croak.jpg";
import glitchToad from "./assets/cards/glitch_toad.jpg";
import wartyPrince from "./assets/cards/warty_prince.jpg";
import copycat from "./assets/cards/copycat.jpg";
import deepCroak from "./assets/cards/deep_croak.jpg";
import primordialCroak from "./assets/cards/primordial_croak.jpg";
import cubDev from "./assets/cards/cub_dev.jpg";
import grizzlyGrinder from "./assets/cards/grizzly_grinder.jpg";
import shipItBruin from "./assets/cards/ship_it_bruin.jpg";
import blueprint from "./assets/cards/blueprint.jpg";
import scaffoldKodiak from "./assets/cards/scaffold_kodiak.jpg";
import efficientUrsa from "./assets/cards/efficient_ursa.jpg";
import prototypeCub from "./assets/cards/prototype_cub.jpg";
import technicalDebt from "./assets/cards/technical_debt.jpg";
import modularPanda from "./assets/cards/modular_panda.jpg";
import iteratingBruin from "./assets/cards/iterating_bruin.jpg";
import crunchTime from "./assets/cards/crunch_time.jpg";
import fullStackGrizzly from "./assets/cards/full_stack_grizzly.jpg";
import unicornUrsa from "./assets/cards/unicorn_ursa.jpg";
import degenApe from "./assets/cards/degen_ape.jpg";
import overleveraged_gibbon from "./assets/cards/overleveraged_gibbon.jpg";
import slowBurn from "./assets/cards/slow_burn.jpg";
import emberCurse from "./assets/cards/ember_curse.jpg";
import marginCall from "./assets/cards/margin_call.jpg";
import rugPull from "./assets/cards/rug_pull.jpg";
import leverageMandrill from "./assets/cards/leverage_mandrill.jpg";
import yoloAllin from "./assets/cards/yolo_allin.jpg";
import blownOutChimp from "./assets/cards/blown_out_chimp.jpg";
import liquidatedMacaque from "./assets/cards/liquidated_macaque.jpg";
import diamondGorilla from "./assets/cards/diamond_gorilla.jpg";
import moon_ape from "./assets/cards/moon_ape.jpg";
import exitSilverback from "./assets/cards/exit_silverback.jpg";
import shortPosition from "./assets/cards/short_position.jpg";

/**
 * templateId -> illustration. Sparse on purpose — branding.md Section 9's art
 * pass is a slow background task (Grok generation limits), so most cards have
 * no entry yet and CardFace falls back to its CSS placeholder glow. Standard
 * edition only for now; Foil is a pure CSS effect over this same art (never a
 * separate asset), Full Art/1st Edition are a future separate generation pass.
 *
 * Doggos, Frogs, Bears, and Apes factions complete as of
 * grok-card-prompts.md (10/10, 11/11, 13/13, 14/14 real templates —
 * Puppy/Tadpole are summon-only tokens, lowest generation priority, still
 * unart'd).
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
  leap_frog: leapFrog,
  warty_lookout: wartyLookout,
  frog_swarm: frogSwarm,
  sticky_tongue: stickyTongue,
  mimic_frog: mimicFrog,
  chaos_croak: chaosCroak,
  glitch_toad: glitchToad,
  warty_prince: wartyPrince,
  copycat,
  deep_croak: deepCroak,
  primordial_croak: primordialCroak,
  cub_dev: cubDev,
  grizzly_grinder: grizzlyGrinder,
  ship_it_bruin: shipItBruin,
  blueprint: blueprint,
  scaffold_kodiak: scaffoldKodiak,
  efficient_ursa: efficientUrsa,
  prototype_cub: prototypeCub,
  technical_debt: technicalDebt,
  modular_panda: modularPanda,
  iterating_bruin: iteratingBruin,
  crunch_time: crunchTime,
  full_stack_grizzly: fullStackGrizzly,
  unicorn_ursa: unicornUrsa,
  degen_ape: degenApe,
  overleveraged_gibbon,
  slow_burn: slowBurn,
  ember_curse: emberCurse,
  margin_call: marginCall,
  rug_pull: rugPull,
  leverage_mandrill: leverageMandrill,
  yolo_allin: yoloAllin,
  blown_out_chimp: blownOutChimp,
  liquidated_macaque: liquidatedMacaque,
  diamond_gorilla: diamondGorilla,
  moon_ape,
  exit_silverback: exitSilverback,
  short_position: shortPosition,
};

export function cardArt(templateId: string): string | undefined {
  return CARD_ART[templateId];
}
