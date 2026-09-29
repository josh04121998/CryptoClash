import { expect } from "chai";
import { deriveTokenId, tokenIdToInstanceId, tokenIdToUriHex, uriHexToTokenId } from "../src/tokenId.js";

describe("tokenId", function () {
  it("derives a token id from a UUID deterministically", function () {
    const id = deriveTokenId("11111111-2222-3333-4444-555555555555");
    expect(id).to.equal(BigInt("0x11111111222233334444555555555555"));
  });

  it("is reversible", function () {
    const uuid = "a1b2c3d4-e5f6-4789-abcd-0123456789ab";
    expect(tokenIdToInstanceId(deriveTokenId(uuid))).to.equal(uuid);
  });

  it("gives two different UUIDs two different token ids", function () {
    const a = deriveTokenId("00000000-0000-0000-0000-000000000001");
    const b = deriveTokenId("00000000-0000-0000-0000-000000000002");
    expect(a).to.not.equal(b);
  });

  it("rejects a non-UUID string", function () {
    expect(() => deriveTokenId("not-a-uuid")).to.throw();
  });

  it("tokenIdToUriHex zero-pads to the full EIP-1155 64-char form", function () {
    const id = deriveTokenId("11111111-2222-3333-4444-555555555555");
    const hex = tokenIdToUriHex(id);
    expect(hex).to.have.lengthOf(64);
    expect(hex.endsWith("11111111222233334444555555555555")).to.be.true; // the real 32-char value, unpadded
    expect(hex.slice(0, 32)).to.equal("0".repeat(32)); // the other half is pure zero padding
  });

  it("uriHexToTokenId/tokenIdToUriHex round-trip through a real UUID", function () {
    const uuid = "a1b2c3d4-e5f6-4789-abcd-0123456789ab";
    const id = deriveTokenId(uuid);
    const hex = tokenIdToUriHex(id);
    expect(uriHexToTokenId(hex)).to.equal(id);
    expect(tokenIdToInstanceId(uriHexToTokenId(hex))).to.equal(uuid);
  });

  it("uriHexToTokenId rejects non-hex input", function () {
    expect(() => uriHexToTokenId("not-hex")).to.throw();
  });
});
