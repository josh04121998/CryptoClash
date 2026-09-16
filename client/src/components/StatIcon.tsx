/**
 * Small inline-SVG glyphs for the cost/attack/health gems on `CardFace` —
 * a shape+color-coded badge reads ambiguously at a glance (user feedback:
 * "what do the diamonds mean"), the same problem Hearthstone solves with a
 * mana-drop/sword/heart icon on each gem. Plain inline SVG rather than an
 * emoji character deliberately: an earlier attempt using ⚔ (crossed
 * swords, U+2694) silently fell back to a bare "×" glyph on this system —
 * no color-emoji font covering it — while a hand-drawn shape renders
 * identically everywhere, same reasoning the rest of this card frame
 * avoids emoji/icon-font dependencies (branding.md's "no art-asset
 * pipeline, CSS/SVG only" precedent).
 *
 * The attack icon is a plain spearhead, not a literal sword — an earlier
 * multi-part sword (blade + crossguard + handle + pommel as separate
 * shapes) turned into an illegible smudge at the ~20px board gem renders
 * at, caught by the user from a real screenshot. Bold single-shape icons
 * (this, the lightning bolt, the heart) hold up at tiny sizes; anything
 * with thin separate parts doesn't.
 */
export function StatIcon({ kind }: { kind: "energy" | "attack" | "health" }) {
  if (kind === "energy") {
    return (
      <svg className="card-face__stat-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13 2L4.5 14.5H11L9 22L19.5 9H13L13 2Z" />
      </svg>
    );
  }
  if (kind === "health") {
    return (
      <svg className="card-face__stat-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg className="card-face__stat-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L18 12H14.5V22H9.5V12H6Z" />
    </svg>
  );
}
