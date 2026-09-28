import { expect } from "chai";
import { buildMetadata, type MintableInstance } from "../src/metadata.js";

const base: MintableInstance = {
  instanceId: "11111111-2222-3333-4444-555555555555",
  templateId: "moon_dog",
  name: "Moon Dog",
  rarity: "Rare",
  faction: "Doggos",
  text: "While next to another Doggo, this creature has +1 Attack.",
  type: "Creature",
  cost: 3,
  attack: 4,
  health: 4,
  keywords: [],
  editionType: "standard",
  isFoil: false,
  conditionGrade: null,
  serialNumber: null,
  isFirstEdition: false,
};

describe("buildMetadata", function () {
  it("builds the base attributes every instance carries", function () {
    const meta = buildMetadata(base, "ipfs://placeholder/1.png");
    expect(meta.name).to.equal("Moon Dog");
    expect(meta.image).to.equal("ipfs://placeholder/1.png");
    expect(meta.attributes).to.deep.include({ trait_type: "Faction", value: "Doggos" });
    expect(meta.attributes).to.deep.include({ trait_type: "Rarity", value: "Rare" });
    expect(meta.attributes).to.deep.include({ trait_type: "Edition", value: "Standard" });
    expect(meta.attributes).to.deep.include({ trait_type: "Foil", value: "No" });
  });

  it("omits Condition/Serial/First Edition traits when the instance doesn't have them", function () {
    const meta = buildMetadata(base, "ipfs://x");
    const traitTypes = meta.attributes.map((a) => a.trait_type);
    expect(traitTypes).to.not.include("Condition");
    expect(traitTypes).to.not.include("Serial Number");
    expect(traitTypes).to.not.include("First Edition");
  });

  it("adds Condition band + numeric grade when present", function () {
    const meta = buildMetadata({ ...base, conditionGrade: 9 }, "ipfs://x");
    expect(meta.attributes).to.deep.include({ trait_type: "Condition", value: "Prime" });
    expect(meta.attributes).to.deep.include({ trait_type: "Condition Grade", value: 9 });
  });

  it("adds a Serial Number trait and appends it to the display name when present", function () {
    const meta = buildMetadata({ ...base, serialNumber: 7 }, "ipfs://x");
    expect(meta.name).to.equal("Moon Dog #7");
    expect(meta.attributes).to.deep.include({ trait_type: "Serial Number", value: 7 });
  });

  it("adds a First Edition trait only when true", function () {
    const withFirst = buildMetadata({ ...base, isFirstEdition: true }, "ipfs://x");
    expect(withFirst.attributes).to.deep.include({ trait_type: "First Edition", value: "Yes" });

    const without = buildMetadata(base, "ipfs://x");
    expect(without.attributes.map((a) => a.trait_type)).to.not.include("First Edition");
  });

  it("labels every edition type correctly", function () {
    expect(buildMetadata({ ...base, editionType: "full_art" }, "x").attributes).to.deep.include({
      trait_type: "Edition",
      value: "Full Art",
    });
    expect(buildMetadata({ ...base, editionType: "ultra" }, "x").attributes).to.deep.include({
      trait_type: "Edition",
      value: "Ultra",
    });
    expect(buildMetadata({ ...base, editionType: "secret" }, "x").attributes).to.deep.include({
      trait_type: "Edition",
      value: "Secret",
    });
  });

  it("marks Foil as Yes when the instance is foil", function () {
    const meta = buildMetadata({ ...base, isFoil: true }, "ipfs://x");
    expect(meta.attributes).to.deep.include({ trait_type: "Foil", value: "Yes" });
  });
});
