import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const BASE_URI = "https://example.invalid/metadata/{id}.json";

// The `revertedWithCustomError` chai matcher (from hardhat-ethers-chai-matchers) surfaced the
// revert as an unhandled rejection that crashed the whole mocha run in this environment rather
// than resolving into the matcher, regardless of gasLimit overrides — so revert cases here use a
// plain try/catch instead, checking the real on-chain revert reason directly rather than relying
// on that matcher's promise plumbing.
async function expectOwnableRevert(promise: Promise<unknown>, expectedAddress: string) {
  try {
    await promise;
  } catch (err) {
    expect(String(err)).to.include("OwnableUnauthorizedAccount").and.to.include(expectedAddress);
    return;
  }
  expect.fail("expected the call to revert with OwnableUnauthorizedAccount, but it succeeded");
}

describe("FloorwarsCards", function () {
  async function deploy() {
    const [owner, other] = await ethers.getSigners();
    const cards = await ethers.deployContract("FloorwarsCards", [BASE_URI, owner.address]);
    return { cards, owner, other };
  }

  it("sets the deployer as owner", async function () {
    const { cards, owner } = await deploy();
    expect(await cards.owner()).to.equal(owner.address);
  });

  it("returns the configured URI", async function () {
    const { cards } = await deploy();
    expect(await cards.uri(1n)).to.equal(BASE_URI);
  });

  it("lets the owner mint", async function () {
    const { cards, other } = await deploy();
    await cards.mint(other.address, 1n, 5n, "0x");
    expect(await cards.balanceOf(other.address, 1n)).to.equal(5n);
  });

  it("rejects a mint from a non-owner", async function () {
    const { cards, other } = await deploy();
    await expectOwnableRevert(cards.connect(other).mint(other.address, 1n, 5n, "0x"), other.address);
  });

  it("lets the owner update the URI", async function () {
    const { cards } = await deploy();
    const newUri = "https://example.invalid/v2/{id}.json";
    await cards.setURI(newUri);
    expect(await cards.uri(1n)).to.equal(newUri);
  });

  it("rejects a URI update from a non-owner", async function () {
    const { cards, other } = await deploy();
    await expectOwnableRevert(
      cards.connect(other).setURI("https://example.invalid/nope/{id}.json"),
      other.address,
    );
  });
});
