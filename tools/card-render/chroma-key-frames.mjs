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
    async ({ low, high, boardCropFraction }) => {
      const img = document.querySelector("img");
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        let alpha;
        if (lum <= low) alpha = 0;
        else if (lum >= high) alpha = 255;
        else alpha = Math.round(((lum - low) / (high - low)) * 255);
        d[i + 3] = alpha;
      }
      ctx.putImageData(imageData, 0, 0);

      const boardHeight = Math.round(canvas.height * boardCropFraction);
      const boardCanvas = document.createElement("canvas");
      boardCanvas.width = canvas.width;
      boardCanvas.height = boardHeight;
      boardCanvas.getContext("2d").drawImage(canvas, 0, 0, canvas.width, boardHeight, 0, 0, canvas.width, boardHeight);

      return { fullDataUrl: canvas.toDataURL("image/png"), boardDataUrl: boardCanvas.toDataURL("image/png") };
    },
    { low: LOW, high: HIGH, boardCropFraction: BOARD_CROP_FRACTION }
  );
  writeFileSync(path.join(OUT_DIR, `${rarity}.png`), Buffer.from(fullDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  writeFileSync(path.join(OUT_DIR, `${rarity}-board.png`), Buffer.from(boardDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  console.log("wrote", rarity, "+ board variant");
}

await browser.close();
