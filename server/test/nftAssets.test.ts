import { describe, expect, it } from "vitest";
import { hasArt, metadataFor, publicBaseUrl } from "../src/nftAssets.js";

describe("nftAssets", () => {
  describe("hasArt", () => {
    it("is true for a real generated card illustration", () => {
      expect(hasArt("moon_dog")).toBe(true);
    });

    it("is false for a template with no generated art", () => {
      expect(hasArt("definitely_not_a_real_template_id")).toBe(false);
    });
  });

  describe("publicBaseUrl", () => {
    it("prefers PUBLIC_SERVER_URL when set, stripping any trailing slash", () => {
      process.env.PUBLIC_SERVER_URL = "https://floorwars.example/";
      try {
        expect(publicBaseUrl({ headers: {} })).toBe("https://floorwars.example");
      } finally {
        delete process.env.PUBLIC_SERVER_URL;
      }
    });

    it("falls back to the request's own host + x-forwarded-proto (Railway terminates TLS at its proxy)", () => {
      expect(publicBaseUrl({ headers: { host: "vivacious-passion.up.railway.app", "x-forwarded-proto": "https" } })).toBe(
        "https://vivacious-passion.up.railway.app",
      );
    });

    it("defaults to http when there's no forwarded-proto header (a plain local dev run)", () => {
      expect(publicBaseUrl({ headers: { host: "localhost:8787" } })).toBe("http://localhost:8787");
    });
  });

  describe("metadataFor", () => {
    it("points the image field at this server's own /api/metadata/:hex.png route", () => {
      const instance = {
        instanceId: "a1b2c3d4-e5f6-4789-abcd-0123456789ab",
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
        editionType: "standard" as const,
        isFoil: false,
        conditionGrade: null,
        serialNumber: null,
        isFirstEdition: false,
      };
      const metadata = metadataFor(instance, 12345n, "https://example.com");
      expect(metadata.image).toBe("https://example.com/api/metadata/0000000000000000000000000000000000000000000000000000000000003039.png");
      expect(metadata.name).toBe("Moon Dog");
    });
  });
});
