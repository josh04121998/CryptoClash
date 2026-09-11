// Prototype card compositor — proves out "generate art only, composite the rest
// as data-driven text over a real frame template" (see chat: Hearthstone does the
// same split, never bakes stats/name into the illustration). This is a throwaway
// prototype script, not wired into the app build: card data below is hand-copied
// from engine/src/cards.ts rather than imported, and the frame is a refined CSS
// template rather than a real illustrated frame asset (that still needs to be
// generated via Grok per branding.md's forthcoming frame brief). Once a real
// frame image exists, swap this template's CSS-drawn shapes for that image.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RARITY_COLOR = { Common: "#9ca3af", Uncommon: "#22c55e", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b" };
const FACTION_COLOR = { Doggos: "#f5a623", Frogs: "#4ade80", Degens: "#ef4444", CryptoBros: "#facc15", Builders: "#60a5fa", Normies: "#a3a3a3" };
const FACTION_TICKER = { Doggos: "DOG", Frogs: "FRG", Degens: "DGN", CryptoBros: "CBR", Builders: "BLD", Normies: "NRM" };

async function renderCard(card, artPath, outPath) {
  const template = readFileSync(path.join(__dirname, "template.html"), "utf-8");
  const artUrl = pathToFileURL(path.resolve(artPath)).href;

  const keywordHtml = card.keyword ? `<div class="keyword">${card.keyword}</div>` : "";

  const html = template
    .replaceAll("{{RARITY_COLOR}}", RARITY_COLOR[card.rarity])
    .replaceAll("{{FACTION_COLOR}}", FACTION_COLOR[card.faction])
    .replaceAll("{{ART_URL}}", artUrl)
    .replaceAll("{{COST}}", card.cost)
    .replaceAll("{{TICKER}}", FACTION_TICKER[card.faction])
    .replaceAll("{{NAME}}", card.name)
    .replaceAll("{{KEYWORD_HTML}}", keywordHtml)
    .replaceAll("{{RULES_TEXT}}", card.text)
    .replaceAll("{{TYPE}}", card.type)
    .replaceAll("{{FACTION}}", card.faction)
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

const moonDog = {
  id: "moon_dog",
  name: "Moon Dog",
  faction: "Doggos",
  type: "Creature",
  cost: 3,
  rarity: "Rare",
  attack: 4,
  health: 4,
  text: "Gain +1 Attack while next to another Doggo.",
  keyword: "Aura",
};

await renderCard(moonDog, path.join(__dirname, "../../client/src/assets/cards/moon_dog.jpg"), path.join(__dirname, "output/moon_dog_standard.png"));
console.log("Rendered: tools/card-render/output/moon_dog_standard.png");
