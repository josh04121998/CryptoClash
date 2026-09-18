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
import juniorDev from "./assets/cards/junior_dev.jpg";
import codeMonkey from "./assets/cards/code_monkey.jpg";
import shipIt from "./assets/cards/ship_it.jpg";
import blueprint from "./assets/cards/blueprint.jpg";
import scaffoldBot from "./assets/cards/scaffold_bot.jpg";
import efficientEngineer from "./assets/cards/efficient_engineer.jpg";
import rapidPrototype from "./assets/cards/rapid_prototype.jpg";
import technicalDebt from "./assets/cards/technical_debt.jpg";
import modularFrame from "./assets/cards/modular_frame.jpg";
import iterationCycle from "./assets/cards/iteration_cycle.jpg";
import crunchTime from "./assets/cards/crunch_time.jpg";
import fullStackTitan from "./assets/cards/full_stack_titan.jpg";
import unicornStartup from "./assets/cards/unicorn_startup.jpg";

/**
 * templateId -> illustration. Sparse on purpose — branding.md Section 9's art
 * pass is a slow background task (Grok generation limits), so most cards have
 * no entry yet and CardFace falls back to its CSS placeholder glow. Standard
 * edition only for now; Foil is a pure CSS effect over this same art (never a
 * separate asset), Full Art/1st Edition are a future separate generation pass.
 *
 * Doggos, Frogs, and Builders factions complete as of grok-card-prompts.md
 * (10/10, 11/11, 13/13 real templates — Puppy/Tadpole are summon-only tokens,
 * lowest generation priority, still unart'd).
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
  junior_dev: juniorDev,
  code_monkey: codeMonkey,
  ship_it: shipIt,
  blueprint: blueprint,
  scaffold_bot: scaffoldBot,
  efficient_engineer: efficientEngineer,
  rapid_prototype: rapidPrototype,
  technical_debt: technicalDebt,
  modular_frame: modularFrame,
  iteration_cycle: iterationCycle,
  crunch_time: crunchTime,
  full_stack_titan: fullStackTitan,
  unicorn_startup: unicornStartup,
};

export function cardArt(templateId: string): string | undefined {
  return CARD_ART[templateId];
}
