// Card compositor — proves out "generate art only, composite the rest as
// data-driven text over a real frame" (Hearthstone does the same split, never
// bakes stats/name into the illustration). The frame is the real generated
// illustration (client/src/assets/frames/*.png, real alpha via
// chroma-key-frames.mjs) — no longer a CSS-drawn placeholder.
//
// Session 36: refactored from a hardcoded-3-cards prototype into a reusable
// renderCardInstance() export, driven by a MintableInstance-shaped object (see
// web3/src/metadata.ts for the canonical shape) — the same DB-instance data a
// real minting pipeline reads, not hand-copied card data. Also adds the foil
// and condition-grade layers template.html gained this session, so a minted
// image actually looks different per instance, not just carries different
// metadata traits (collectibility.md Section 12.5's flagged gap).
//
// Running this file directly (`node render-card.mjs`) still renders a small
// demo set for quick visual spot-checking — see DEMO_INSTANCES below.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same values as client/src/factionColor.ts / factionTicker.ts — duplicated rather than
// imported, since this is a plain script (not a workspace) and those are client-presentation
// concerns, not something the engine or web3 workspaces own. Keep in sync by hand if they change.
const FACTION_COLOR = {
  Doggos: "#f5a623",
  Frogs: "#4ade80",
  Apes: "#ef4444",
  Bulls: "#facc15",
  Bears: "#60a5fa",
  Cats: "#c084fc",
  Neutral: "#8a93ab",
};
const FACTION_TICKER = {
  Doggos: "DOG",
  Frogs: "FRG",
  Apes: "APE",
  Bulls: "BUL",
  Bears: "BER",
  Cats: "CAT",
  Neutral: "NTR",
};

// Same fallback as client/src/frameArt.ts: any rarity without a real frame asset yet
// (Mythic/Genesis — no art generated for these tiers) renders with the Legendary frame rather
// than nothing.
const FRAMED_RARITIES = new Set(["Common", "Uncommon", "Rare", "Epic", "Legendary"]);
function frameFileFor(rarity) {
  const key = FRAMED_RARITIES.has(rarity) ? rarity : "Legendary";
  return `${key.toLowerCase()}.png`;
}

function conditionVisualTier(grade) {
  if (grade === null || grade === undefined) return null;
  if (grade >= 9) return "pristine";
  if (grade <= 2) return "worn";
  return null;
}

/**
 * Renders one card instance to a flat PNG. `instance` is MintableInstance-shaped (see
 * web3/src/metadata.ts) plus the gameplay fields needed to draw the face (name/faction/type/
 * cost/attack/health/keywords/text/rarity) — everything CARD_POOL plus a card_instances row
 * together carry. `artPath` is the source illustration file, `outPath` where the PNG lands.
 */
export async function renderCardInstance(instance, artPath, outPath) {
  const template = readFileSync(path.join(__dirname, "template.html"), "utf-8");
  const artUrl = pathToFileURL(path.resolve(artPath)).href;
  const framePath = path.join(__dirname, `../../client/src/assets/frames/${frameFileFor(instance.rarity)}`);
  const frameUrl = pathToFileURL(framePath).href;

  const keywordHtml =
    instance.keywords && instance.keywords.length > 0
      ? `<div class="keyword">${instance.keywords.join(" · ")}</div>`
      : "";

  const factionLabel = instance.faction.replace(/([A-Z])/g, " $1").trim().toUpperCase();

  const conditionTier = conditionVisualTier(instance.conditionGrade);
  const conditionHtml =
    conditionTier === "pristine"
      ? `<div class="condition-pristine"></div>`
      : conditionTier === "worn"
        ? `<div class="condition-worn"></div>`
        : "";

  const html = template
    .replaceAll("{{FACTION_COLOR}}", FACTION_COLOR[instance.faction] ?? "#8a93ab")
    .replaceAll("{{ART_URL}}", artUrl)
    .replaceAll("{{FRAME_URL}}", frameUrl)
    .replaceAll("{{COST}}", instance.cost)
    .replaceAll("{{TICKER}}", FACTION_TICKER[instance.faction] ?? "???")
    .replaceAll("{{NAME}}", instance.name)
    .replaceAll("{{KEYWORD_HTML}}", keywordHtml)
    .replaceAll("{{RULES_TEXT}}", instance.text)
    .replaceAll("{{TYPE}}", (instance.type ?? "Creature").toUpperCase())
    .replaceAll("{{FACTION}}", factionLabel)
    .replaceAll("{{ATTACK}}", instance.attack ?? "")
    .replaceAll("{{HEALTH}}", instance.health ?? "")
    .replaceAll("{{CARD_CLASS}}", instance.isFoil ? "foil" : "")
    .replaceAll("{{ART_CLASS}}", conditionTier === "worn" ? "worn" : "")
    .replaceAll("{{CONDITION_HTML}}", conditionHtml);

  const tmpHtmlPath = path.join(__dirname, `_tmp_${instance.instanceId ?? instance.templateId}.html`);
  writeFileSync(tmpHtmlPath, html, "utf-8");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 2100 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmpHtmlPath).href);
    await page.waitForTimeout(300); // let the @import Google Font finish loading
    const cardEl = await page.$(".card");
    await cardEl.screenshot({ path: outPath });
  } finally {
    await browser.close();
    unlinkSync(tmpHtmlPath);
  }
}

// --- Demo mode (only runs when this file is executed directly, not when imported) ---

const DEMO_INSTANCES = [
  {
    instanceId: "demo-moon-dog",
    templateId: "moon_dog",
    name: "Moon Dog",
    faction: "Doggos",
    type: "Creature",
    cost: 3,
    rarity: "Rare",
    attack: 4,
    health: 4,
    text: "Gain +1 Attack while next to another Doggo.",
    keywords: [],
    isFoil: false,
    conditionGrade: null,
  },
  {
    instanceId: "demo-alpha-dog",
    templateId: "alpha_dog",
    name: "Alpha Dog",
    faction: "Doggos",
    type: "Creature",
    cost: 6,
    rarity: "Legendary",
    attack: 6,
    health: 7,
    text: "Deathrattle: Summon two 1/1 Puppies.",
    keywords: [],
    isFoil: false,
    conditionGrade: null,
  },
  {
    instanceId: "demo-shield-pup",
    templateId: "shield_pup",
    name: "Shield Pup",
    faction: "Doggos",
    type: "Creature",
    cost: 2,
    rarity: "Uncommon",
    attack: 2,
    health: 3,
    text: "Guard.",
    keywords: ["Guard"],
    isFoil: false,
    conditionGrade: null,
  },
];

async function runDemo() {
  for (const instance of DEMO_INSTANCES) {
    const artPath = path.join(__dirname, `../../client/src/assets/cards/${instance.templateId}.jpg`);
    const outPath = path.join(__dirname, `output/${instance.templateId}_standard.png`);
    await renderCardInstance(instance, artPath, outPath);
    console.log("Rendered:", outPath);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runDemo();
}
