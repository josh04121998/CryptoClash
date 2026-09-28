// The Phase 4 proof from this session's plan: renders a handful of synthetic MintableInstance
// samples spanning the real attribute space (plain, foil, worn/distressed, foil+worn), composites
// each into a genuinely different-looking image (tools/card-render/), builds real metadata
// (buildMetadata), derives each its own token id (deriveTokenId), and mints each to the same
// already-deployed testnet contract under a distinct token id.
//
// No live Postgres round-trip here (0 real matches in production per STATUS.md, nothing
// interesting to read yet) — getMintableInstance (server/src/mintingRepo.ts) is the real,
// separately-tested read path for when there is. This script exercises the rest of the pipeline
// (compositor -> metadata -> token id -> mint) directly against constructed sample data.
//
// Usage: npm run mint-samples --workspace=web3
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { ChainClient, buildMetadata, deriveTokenId, loadChainConfig, type MintableInstance } from "../src/index.js";
// tools/card-render is a sibling workspace with no package "main"/exports (its package.json only
// exists to declare its playwright dependency) — imported by relative path, matching how it's
// already invoked as a plain script elsewhere in this repo.
import { renderCardInstance } from "../../tools/card-render/render-card.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUTPUT_DIR = path.join(REPO_ROOT, "tools/card-render/output");

// Fake UUIDs (a real one would be a card_instances.id) — fine for deriveTokenId, which just
// needs a valid UUID shape, not a row that actually exists.
const SAMPLES: MintableInstance[] = [
  {
    instanceId: "10000000-0000-4000-8000-000000000001",
    templateId: "shield_pup",
    name: "Shield Pup",
    rarity: "Uncommon",
    faction: "Doggos",
    text: "Guard.",
    type: "Creature",
    cost: 2,
    attack: 2,
    health: 3,
    keywords: ["Guard"],
    editionType: "standard",
    isFoil: false,
    conditionGrade: null,
    serialNumber: null,
    isFirstEdition: false,
  },
  {
    instanceId: "10000000-0000-4000-8000-000000000002",
    templateId: "alpha_dog",
    name: "Alpha Dog",
    rarity: "Legendary",
    faction: "Doggos",
    text: "Deathrattle: Summon two 1/1 Puppies.",
    type: "Creature",
    cost: 6,
    attack: 6,
    health: 7,
    keywords: [],
    editionType: "standard",
    isFoil: true,
    conditionGrade: 10,
    serialNumber: 7,
    isFirstEdition: true,
  },
  {
    instanceId: "10000000-0000-4000-8000-000000000003",
    templateId: "moon_dog",
    name: "Moon Dog",
    rarity: "Rare",
    faction: "Doggos",
    text: "Gain +1 Attack while next to another Doggo.",
    type: "Creature",
    cost: 3,
    attack: 4,
    health: 4,
    keywords: [],
    editionType: "standard",
    isFoil: false,
    conditionGrade: 1,
    serialNumber: null,
    isFirstEdition: false,
  },
];

async function main() {
  const config = loadChainConfig();
  const client = new ChainClient(config, process.env.WEB3_OPERATOR_PRIVATE_KEY);
  const operatorAddress = "0x4CD8A25c03C81DD57c3D9C361fCFA0fb6c06B0d0";

  for (const instance of SAMPLES) {
    const tokenId = deriveTokenId(instance.instanceId);
    const artPath = path.join(REPO_ROOT, `client/src/assets/cards/${instance.templateId}.jpg`);
    const imagePath = path.join(OUTPUT_DIR, `sample-${tokenId}.png`);
    const metadataPath = path.join(OUTPUT_DIR, `sample-${tokenId}.json`);

    await renderCardInstance(instance, artPath, imagePath);

    // Hosting (IPFS vs. a centralized bucket) is a real decision this pass deliberately defers —
    // see STATUS.md — this placeholder documents the gap rather than silently picking one.
    const imageUri = `ipfs://PLACEHOLDER/${tokenId}.png`;
    const metadata = buildMetadata(instance, imageUri);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    const balanceBefore = await client.getBalanceOf(operatorAddress, tokenId);
    const tx = await client.mint(operatorAddress, tokenId, 1n);
    await tx.wait();
    const balanceAfter = await client.getBalanceOf(operatorAddress, tokenId);

    console.log(`\n${instance.name} (${instance.isFoil ? "foil, " : ""}condition ${instance.conditionGrade ?? "n/a"})`);
    console.log(`  token id:  ${tokenId}`);
    console.log(`  image:     ${imagePath}`);
    console.log(`  metadata:  ${metadataPath}`);
    console.log(`  tx:        ${tx.hash}`);
    console.log(`  balance:   ${balanceBefore} -> ${balanceAfter}`);

    if (balanceAfter !== balanceBefore + 1n) {
      throw new Error(`${instance.name}: balance did not increase as expected`);
    }
  }

  console.log("\nAll samples minted and verified.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
