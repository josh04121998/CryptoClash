// Converts the generated rarity-frame JPEGs (branding/assets/Rarity/*.jpg —
// a flat near-black background in the art/text windows, since AI image
// output has no real alpha channel, per branding.md §9.6's generation
// constraint) into PNGs with real alpha transparency, written to
// client/src/assets/frames/*.png for CardFace.tsx (frameArt.ts) to layer
// over card art with a plain background-image.
//
// This replaced an earlier mix-blend-mode: lighten approach that looked
// correct in isolation but silently failed to paint once nested inside the
// actual card component tree (.card-face > .card-face__art +
// .card-face__frame, both position:absolute inside an overflow:hidden
// button) — reproducible, not explained by any stacking/containing-block
// property on the ancestor chain (checked contain/overflow/transform/
// filter/isolation/will-change — all default). Real alpha sidesteps it
// entirely and gives a pixel-perfect cutout instead of an approximation
// that can wash out against bright art anyway.
//
// Also writes a `<rarity>-board.png` per tier — the same frame cropped to
// just the art window + its bottom crossbar (the top ~60.8% of the source,
// measured empirically), no second/text window. Board-size minions
// (CardFace.tsx's size="board") never render name/text, so the full
// two-window frame's crossbar showed up as a stray bright line bisecting
// the art with nothing below it to justify it — a real bug the user caught
// live. The board variant is a real asset, not a CSS crop, so the border
// corners/edges stay crisp at the tiny size board cards render at.
//
// Every source JPEG also carries a ~20-30px near-white canvas margin
// outside the gold/silver border itself (the generator's own page
// background, not part of the frame art) — measured consistently across
// all five tiers via tools/card-render/measure-margin.mjs. The luminance
// threshold below only strips near-BLACK background (the art/text window
// interiors); it can't also treat "near-white" as background without
// eating the border's own bright highlights, so that margin used to
// survive as an opaque white rectangle around every card in the live game
// — the real cause of the "white borders" the user kept seeing even after
// the crossbar fix. Fixed by auto-detecting and cropping that margin out
// (scanning inward from each edge along the center row/column for the
// first non-near-white pixel) before doing anything else, so the frame PNG
// starts right at the border's own outer edge with nothing left to bleed.
//
// Common's generated frame also came back a genuinely pale, near-white
// "brushed silver" (measured directly: RGB ~190-215 across most of the
// border's width, against rarityColor.ts's intended #9ca3af/(156,163,175)
// accent, which only actually shows up as a thin ~2px rim at the border's
// very outer edge) — not a margin-crop leftover (verified separately), just
// how light that source illustration's metal tone is. Every other rarity's
// warmer gold/green/blue/purple tone reads fine at the same brightness, so
// this is scoped to Common only: darken its opaque pixels toward a real
// gunmetal tone after alpha is computed (so the near-black/near-white
// transparency keying above is unaffected) rather than regenerating the art.
const COMMON_DARKEN = 0.72;

// Re-run this whenever branding/assets/Rarity/*.jpg is regenerated:
//   node tools/card-render/chroma-key-frames.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "../../branding/assets/Rarity");
const OUT_DIR = path.join(__dirname, "../../client/src/assets/frames");
mkdirSync(OUT_DIR, { recursive: true });

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

// Soft threshold: fully transparent below LOW, fully opaque above HIGH,
// linear ramp between (avoids a jagged binary cutout edge). The generated
// frames' window interior samples well under LOW; the metal border sits
// well above HIGH — measured empirically against common.jpg.
const LOW = 28;
const HIGH = 55;

// Fraction of the source image's height that is "art window + crossbar,
// no second window" — measured against common.jpg (divider band ends at
// y=1051 of 1728 = 60.8%).
const BOARD_CROP_FRACTION = 0.608;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const rarity of RARITIES) {
  const srcPath = path.join(SRC_DIR, `${rarity}.jpg`);
  await page.goto(pathToFileURL(srcPath).href);
  const { fullDataUrl, boardDataUrl } = await page.evaluate(
    async ({ low, high, boardCropFraction, darken }) => {
      const img = document.querySelector("img");
      await img.decode();
      const rawCanvas = document.createElement("canvas");
      rawCanvas.width = img.naturalWidth;
      rawCanvas.height = img.naturalHeight;
      const rawCtx = rawCanvas.getContext("2d");
      rawCtx.drawImage(img, 0, 0);

      // Strip the source's own near-white canvas margin (the generator's page
      // background, not part of the frame art) before anything else — scan
      // inward from each edge along the center row/column for the first
      // pixel that isn't near-white.
      const raw = rawCtx.getImageData(0, 0, rawCanvas.width, rawCanvas.height).data;
      const isWhite = (x, y) => {
        const i = (y * rawCanvas.width + x) * 4;
        return raw[i] > 235 && raw[i + 1] > 235 && raw[i + 2] > 235;
      };
      const midY = Math.floor(rawCanvas.height / 2);
      const midX = Math.floor(rawCanvas.width / 2);
      let left = 0;
      while (left < rawCanvas.width / 2 && isWhite(left, midY)) left++;
      let right = rawCanvas.width - 1;
      while (right > rawCanvas.width / 2 && isWhite(right, midY)) right--;
      let top = 0;
      while (top < rawCanvas.height / 2 && isWhite(midX, top)) top++;
      let bottom = rawCanvas.height - 1;
      while (bottom > rawCanvas.height / 2 && isWhite(midX, bottom)) bottom--;
      const cropWidth = right - left + 1;
      const cropHeight = bottom - top + 1;

      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(rawCanvas, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        let alpha;
        if (lum <= low) alpha = 0;
        else if (lum >= high) alpha = 255;
        else alpha = Math.round(((lum - low) / (high - low)) * 255);
        d[i + 3] = alpha;
        if (darken !== 1) {
          d[i] = Math.round(d[i] * darken);
          d[i + 1] = Math.round(d[i + 1] * darken);
          d[i + 2] = Math.round(d[i + 2] * darken);
        }
      }
      ctx.putImageData(imageData, 0, 0);

      const boardHeight = Math.round(canvas.height * boardCropFraction);
      const boardCanvas = document.createElement("canvas");
      boardCanvas.width = canvas.width;
      boardCanvas.height = boardHeight;
      boardCanvas.getContext("2d").drawImage(canvas, 0, 0, canvas.width, boardHeight, 0, 0, canvas.width, boardHeight);

      return { fullDataUrl: canvas.toDataURL("image/png"), boardDataUrl: boardCanvas.toDataURL("image/png") };
    },
    { low: LOW, high: HIGH, boardCropFraction: BOARD_CROP_FRACTION, darken: rarity === "common" ? COMMON_DARKEN : 1 }
  );
  writeFileSync(path.join(OUT_DIR, `${rarity}.png`), Buffer.from(fullDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  writeFileSync(path.join(OUT_DIR, `${rarity}-board.png`), Buffer.from(boardDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  console.log("wrote", rarity, "+ board variant");
}

await browser.close();
