// Prototype card compositor — proves out "generate art only, composite the rest
// as data-driven text over a real frame" (Hearthstone does the same split, never
// bakes stats/name into the illustration). Still a throwaway prototype script,
// not wired into the app build: card data below is hand-copied from
// engine/src/cards.ts rather than imported. The frame is now the real generated
// illustration (client/src/assets/frames/*.png, real alpha via
// chroma-key-frames.mjs) — no longer a CSS-drawn placeholder.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FACTION_COLOR = { Doggos: "#f5a623", Frogs: "#4ade80", Degens: "#ef4444", CryptoBros: "#facc15", Builders: "#60a5fa", Normies: "#a3a3a3" };
const FACTION_TICKER = { Doggos: "DOG", Frogs: "FRG", Degens: "DGN", CryptoBros: "CBR", Builders: "BLD", Normies: "NRM" };

async function renderCard(card, artPath, outPath) {
  const template = readFileSync(path.join(__dirname, "template.html"), "utf-8");
  const artUrl = pathToFileURL(path.resolve(artPath)).href;
  const framePath = path.join(__dirname, `../../client/src/assets/frames/${card.rarity.toLowerCase()}.png`);
  const frameUrl = pathToFileURL(framePath).href;

  const keywordHtml = card.keyword ? `<div class="keyword">${card.keyword}</div>` : "";

  const factionLabel = card.faction.replace(/([A-Z])/g, " $1").trim().toUpperCase();

  const html = template
    .replaceAll("{{FACTION_COLOR}}", FACTION_COLOR[card.faction])
    .replaceAll("{{ART_URL}}", artUrl)
    .replaceAll("{{FRAME_URL}}", frameUrl)
    .replaceAll("{{COST}}", card.cost)
    .replaceAll("{{TICKER}}", FACTION_TICKER[card.faction])
    .replaceAll("{{NAME}}", card.name)
    .replaceAll("{{KEYWORD_HTML}}", keywordHtml)
    .replaceAll("{{RULES_TEXT}}", card.text)
    .replaceAll("{{TYPE}}", (card.type ?? "Creature").toUpperCase())
    .replaceAll("{{FACTION}}", factionLabel)
    .replaceAll("{{ATTACK}}", card.attack)
    .replaceAll("{{HEALTH}}", card.health);

  const tmpHtmlPath = path.join(__dirname, `_tmp_${card.id}.html`);
  writeFileSync(tmpHtmlPath, html, "utf-8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 2100 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmpHtmlPath).href);
  await page.waitForTimeout(300); // let the @import Google Font finish loading
  const card_el = await page.$(".card");
  await card_el.screenshot({ path: outPath });
  await browser.close();
  unlinkSync(tmpHtmlPath);
}

const CARDS = [
  {
    id: "moon_dog",
    name: "Moon Dog",
    faction: "Doggos",
    cost: 3,
    rarity: "Rare",
    attack: 4,
    health: 4,
    text: "Gain +1 Attack while next to another Doggo.",
    keyword: "Aura",
  },
  {
    id: "alpha_dog",
    name: "Alpha Dog",
    faction: "Doggos",
    cost: 6,
    rarity: "Legendary",
    attack: 6,
    health: 7,
    text: "Deathrattle: Summon two 1/1 Puppies.",
    keyword: null,
  },
  {
    id: "shield_pup",
    name: "Shield Pup",
    faction: "Doggos",
    cost: 2,
    rarity: "Uncommon",
    attack: 2,
    health: 3,
    text: "Guard.",
    keyword: "Guard",
  },
];

for (const card of CARDS) {
  const artPath = path.join(__dirname, `../../client/src/assets/cards/${card.id}.jpg`);
  const outPath = path.join(__dirname, `output/${card.id}_standard.png`);
  await renderCard(card, artPath, outPath);
  console.log("Rendered:", outPath);
}
