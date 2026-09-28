/**
 * The shared shape every layer of the minting pipeline agrees on: the compositor (tools/card-
 * render/) renders from it, this file's buildMetadata() reads from it, and server/src/
 * mintingRepo.ts's getMintableInstance() produces it from a real card_instances row. One
 * contract, not three copies of the same fields drifting independently.
 */
export interface MintableInstance {
  instanceId: string;
  templateId: string;
  name: string;
  rarity: string;
  faction: string;
  text: string;
  /** CardType ("Creature" | "Spell" | "Item" | "Secret") from engine's CARD_POOL. */
  type: string;
  cost: number;
  /** Absent for non-creatures. */
  attack: number | null;
  health: number | null;
  keywords: string[];
  editionType: "standard" | "full_art" | "ultra" | "secret";
  isFoil: boolean;
  /** 1-10, or null for a pre-Condition-axis instance (see migration 0009's nullable column). */
  conditionGrade: number | null;
  serialNumber: number | null;
  isFirstEdition: boolean;
}

export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  attributes: NftAttribute[];
}

// Same band names/thresholds as client/src/conditionGrade.ts's conditionBandName — duplicated
// rather than imported since client depending on web3 (or vice versa) would be the wrong
// direction for this small a piece of pure logic; keep both in sync by hand if the bands change.
function conditionBandName(grade: number): string {
  if (grade >= 10) return "Blue Chip";
  if (grade === 9) return "Prime";
  if (grade === 8) return "Listed";
  if (grade === 7) return "Near Prime";
  if (grade >= 5) return "Trading Range";
  if (grade >= 3) return "Volatile";
  return "Distressed";
}

const EDITION_LABELS: Record<MintableInstance["editionType"], string> = {
  standard: "Standard",
  full_art: "Full Art",
  ultra: "Ultra",
  secret: "Secret",
};

/**
 * Standard OpenSea-style metadata shape (the same `attributes: [{trait_type, value}]` convention
 * collectibility.md Section 12.5 calls for, applies identically whether the underlying token
 * standard is ERC-721 or ERC-1155). `imageUri` is passed in rather than computed here — where
 * the composited image actually lives (IPFS, a bucket, ...) is a real hosting decision this pass
 * deliberately defers; this function just slots whatever URI it's given into the `image` field.
 */
export function buildMetadata(instance: MintableInstance, imageUri: string): NftMetadata {
  const attributes: NftAttribute[] = [
    { trait_type: "Faction", value: instance.faction },
    { trait_type: "Rarity", value: instance.rarity },
    { trait_type: "Edition", value: EDITION_LABELS[instance.editionType] },
    { trait_type: "Foil", value: instance.isFoil ? "Yes" : "No" },
  ];

  if (instance.conditionGrade !== null) {
    attributes.push(
      { trait_type: "Condition", value: conditionBandName(instance.conditionGrade) },
      { trait_type: "Condition Grade", value: instance.conditionGrade },
    );
  }

  if (instance.serialNumber !== null) {
    attributes.push({ trait_type: "Serial Number", value: instance.serialNumber });
  }

  if (instance.isFirstEdition) {
    attributes.push({ trait_type: "First Edition", value: "Yes" });
  }

  return {
    name: instance.serialNumber !== null ? `${instance.name} #${instance.serialNumber}` : instance.name,
    description: instance.text,
    image: imageUri,
    attributes,
  };
}
