// Resizes + recompresses client/src/assets/cards/*.jpg down to their real maximum display
// resolution. The source files are raw AI-generation output (branding.md §9.5) used directly as
// card art — up to ~1.5MP each, 54MB total across 77 cards — but CardFace.tsx only ever renders
// them at up to --hand-card-w (210px at the widest breakpoint, styles.css) times a retina
// multiplier. Same Playwright+canvas approach chroma-key-frames.mjs already uses for image work
// in this repo (no image-processing library dependency), not a new tool.
//
// Usage: node tools/card-render/compress-card-art.mjs [--dry-run]
import { chromium } from "playwright";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(__dirname, "../../client/src/assets/cards");

// 210px is --hand-card-w's ceiling (styles.css, the largest breakpoint) — doubled for a retina
// display, then a little headroom since that ceiling may get tuned further.
const MAX_WIDTH = 480;
const JPEG_QUALITY = 0.82;
const dryRun = process.argv.includes("--dry-run");

const files = readdirSync(CARDS_DIR).filter((f) => f.toLowerCase().endsWith(".jpg"));
console.log(`${files.length} card art files found in ${CARDS_DIR}`);

// file:// resources get treated as unique/opaque origins by default, which taints any canvas
// drawn from one (blocks toDataURL) even after navigating the page to that same file — these
// flags are the standard workaround for local-file image processing via a headless browser.
const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--disable-web-security"] });
const page = await browser.newPage();

let totalBefore = 0;
let totalAfter = 0;
const failed = [];

for (const file of files) {
  const filePath = path.join(CARDS_DIR, file);
  const before = statSync(filePath).size;

  const url = pathToFileURL(filePath).href;
  let dataUrl;
  try {
    // Chromium won't decode a file:// <img> src loaded from an about:blank page (no matching
    // origin) — navigating the page itself to the image's own file:// URL first, same as the
    // one-off probe this was checked against, sidesteps that.
    await page.goto(url);
    dataUrl = await page.evaluate(
      async ({ src, maxWidth, quality }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const width = Math.round(img.naturalWidth * scale);
        const height = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", quality);
      },
      { src: url, maxWidth: MAX_WIDTH, quality: JPEG_QUALITY },
    );
  } catch (err) {
    console.log(`${file}: FAILED TO DECODE (${err.message.split("\n")[0]}) — left untouched`);
    failed.push(file);
    totalBefore += before;
    totalAfter += before;
    continue;
  }

  const base64 = dataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");
  totalBefore += before;
  totalAfter += buffer.length;

  const pct = (100 * (1 - buffer.length / before)).toFixed(0);
  console.log(`${file}: ${(before / 1024).toFixed(0)}KB -> ${(buffer.length / 1024).toFixed(0)}KB (-${pct}%)`);

  if (!dryRun) writeFileSync(filePath, buffer);
}

if (failed.length > 0) {
  console.log(`\n${failed.length} file(s) failed to decode and were left untouched: ${failed.join(", ")}`);
}

await browser.close();

console.log(
  `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(1)}MB -> ${(totalAfter / 1024 / 1024).toFixed(1)}MB` +
    ` (-${(100 * (1 - totalAfter / totalBefore)).toFixed(0)}%)${dryRun ? " [dry run, nothing written]" : ""}`,
);
