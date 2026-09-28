import { expect } from "chai";
import { deriveTokenId, tokenIdToInstanceId } from "../src/tokenId.js";

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
});
