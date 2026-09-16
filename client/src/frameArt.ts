import common from "./assets/frames/common.png";
import uncommon from "./assets/frames/uncommon.png";
import rare from "./assets/frames/rare.png";
import epic from "./assets/frames/epic.png";
import legendary from "./assets/frames/legendary.png";
import commonBoard from "./assets/frames/common-board.png";
import uncommonBoard from "./assets/frames/uncommon-board.png";
import rareBoard from "./assets/frames/rare-board.png";
import epicBoard from "./assets/frames/epic-board.png";
import legendaryBoard from "./assets/frames/legendary-board.png";
import { Rarity } from "@cryptoclash/engine";

/**
 * The real generated rarity-frame illustrations (branding.md §9.6) — an
 * ornate metal border + a two-window shell (art on top, name/text on
 * bottom), one per rarity tier actually in use. The source JPEGs
 * (branding/assets/Rarity/*.jpg) are generated on a flat near-black
 * background (no real alpha channel — AI image output can't produce one) —
 * `tools/card-render/chroma-key-frames.mjs` converts them to these PNGs
 * with real alpha (near-black keyed to transparent), so they layer over a
 * card's art with a plain `background-image`. An earlier `mix-blend-mode:
 * lighten` approach looked right in isolation but silently failed to paint
 * once nested inside the actual card layout — see that script's doc
 * comment. Re-run it whenever the source JPEGs are regenerated.
 *
 * Two variants per rarity: the full two-window frame (art + name/text,
 * used everywhere `CardFace` shows full detail — hand/Collection/Crafting/
 * DeckBuilder/Packs), and a `-board` variant cropped to just the art
 * window + its bottom crossbar. Board-size minions never render name/text
 * (see CardFace.tsx), so the full frame's crossbar showed up as a stray
 * bright line bisecting the art with nothing below it to justify it — a
 * real bug, not the source art (checked every Doggos illustration
 * individually, none have a border baked in).
 *
 * Mythic/Genesis have no frame yet (no template uses those rarities) —
 * falls back to the Legendary frame, the closest tier that exists.
 */
const FRAME_ART: Record<string, string> = {
  Common: common,
  Uncommon: uncommon,
  Rare: rare,
  Epic: epic,
  Legendary: legendary,
};

const FRAME_ART_BOARD: Record<string, string> = {
  Common: commonBoard,
  Uncommon: uncommonBoard,
  Rare: rareBoard,
  Epic: epicBoard,
  Legendary: legendaryBoard,
};

export function frameArt(rarity: Rarity | undefined, compact = false): string | undefined {
  if (!rarity) return undefined;
  const map = compact ? FRAME_ART_BOARD : FRAME_ART;
  return map[rarity] ?? (compact ? legendaryBoard : legendary);
}
