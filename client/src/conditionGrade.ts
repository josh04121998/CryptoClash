/**
 * Condition (Floor Grade) — collectibility.md Section 7's CS:GO-wear-style quality axis,
 * an integer 1-10 rolled once at mint, permanent, never affecting gameplay. Named bands use
 * the game's own finance vocabulary rather than PSA's photographic-condition language
 * (Poor/Good/Mint), and deliberately never say "PSA" anywhere (see that section for why).
 */
export function conditionBandName(grade: number): string {
  if (grade >= 10) return "Blue Chip";
  if (grade === 9) return "Prime";
  if (grade === 8) return "Listed";
  if (grade === 7) return "Near Prime";
  if (grade >= 5) return "Trading Range";
  if (grade >= 3) return "Volatile";
  return "Distressed";
}

/** Cosmetic tier used to scale CardFace's gloss/scuff overlay — only the extremes get a visible treatment, so the common middle of the curve renders unchanged. */
export function conditionVisualTier(grade: number): "pristine" | "worn" | null {
  if (grade >= 9) return "pristine";
  if (grade <= 2) return "worn";
  return null;
}
