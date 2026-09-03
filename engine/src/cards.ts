import { CardTemplate } from "./types.js";

/**
 * Prototype card pool. Deliberately small — just enough to exercise every
 * system in this engine slice: energy curve, positioning/aura, summon,
 * temporary keyword grants, direct damage, Guard, Rush, HODL.
 *
 * Moon Dog / Puppy Swarm / Pack Rush are the exact combo example from
 * batlleSpec.md Section 21.
 */
export const CARD_POOL: Record<string, CardTemplate> = {
  puppy: {
    id: "puppy",
    name: "Puppy",
    faction: "Doggos",
    type: "Creature",
    cost: 0,
    attack: 1,
    health: 1,
    text: "A summoned token, not obtainable in a deck.",
    token: true,
  },
  fast_fang: {
    id: "fast_fang",
    name: "Fast Fang",
    faction: "Doggos",
    type: "Creature",
    cost: 1,
    attack: 2,
    health: 1,
    keywords: ["Rush"],
    text: "Rush.",
  },
  pup_scout: {
    id: "pup_scout",
    name: "Pup Scout",
    faction: "Doggos",
    type: "Creature",
    cost: 1,
    attack: 1,
    health: 2,
    text: "Vanilla.",
  },
  shield_pup: {
    id: "shield_pup",
    name: "Shield Pup",
    faction: "Doggos",
    type: "Creature",
    cost: 2,
    attack: 2,
    health: 3,
    keywords: ["Guard"],
    text: "Guard.",
  },
  puppy_swarm: {
    id: "puppy_swarm",
    name: "Puppy Swarm",
    faction: "Doggos",
    type: "Spell",
    cost: 2,
    text: "Summon two 1/1 Puppies.",
    effects: [{ trigger: "onPlay", action: { kind: "summon", templateId: "puppy", count: 2 } }],
  },
  pack_rush: {
    id: "pack_rush",
    name: "Pack Rush",
    faction: "Doggos",
    type: "Spell",
    cost: 2,
    text: "Give your Doggos Rush this turn.",
    effects: [
      { trigger: "onPlay", action: { kind: "grantKeywordFriendlyBoard", keyword: "Rush" } },
    ],
  },
  spark_bolt: {
    id: "spark_bolt",
    name: "Spark Bolt",
    faction: "Neutral",
    type: "Spell",
    cost: 2,
    text: "Deal 3 damage.",
    effects: [
      {
        trigger: "onPlay",
        requiresTarget: true,
        action: { kind: "damage", target: { kind: "chosen" }, amount: 3 },
      },
    ],
  },
  moon_dog: {
    id: "moon_dog",
    name: "Moon Dog",
    faction: "Doggos",
    type: "Creature",
    cost: 3,
    attack: 4,
    health: 4,
    text: "Gain +1 Attack while next to another Doggo.",
    aura: { filter: "adjacentSameFaction", attack: 1 },
  },
  guard_dog: {
    id: "guard_dog",
    name: "Guard Dog",
    faction: "Doggos",
    type: "Creature",
    cost: 3,
    attack: 3,
    health: 4,
    keywords: ["Guard"],
    text: "Guard.",
  },
  diamond_hands: {
    id: "diamond_hands",
    name: "Diamond Hands",
    faction: "Degens",
    type: "Creature",
    cost: 4,
    attack: 2,
    health: 6,
    keywords: ["HODL"],
    text: "At the start of your turn, gain +1 Attack.",
    effects: [{ trigger: "onTurnStart", action: { kind: "buffSelf", attack: 1 } }],
  },
  loyal_hound: {
    id: "loyal_hound",
    name: "Loyal Hound",
    faction: "Doggos",
    type: "Creature",
    cost: 5,
    attack: 5,
    health: 5,
    text: "Vanilla.",
  },
};

/** A legal 30-card deck built entirely from the pool above (mirror-match sample). */
export const SAMPLE_DECK: string[] = [
  ...Array(4).fill("fast_fang"),
  ...Array(4).fill("pup_scout"),
  ...Array(3).fill("shield_pup"),
  ...Array(3).fill("puppy_swarm"),
  ...Array(2).fill("pack_rush"),
  ...Array(3).fill("spark_bolt"),
  ...Array(3).fill("moon_dog"),
  ...Array(4).fill("guard_dog"),
  ...Array(2).fill("diamond_hands"),
  ...Array(2).fill("loyal_hound"),
];
