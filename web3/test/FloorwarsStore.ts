import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const PRICE = 25_000_000n; // $25.00 at USDG's real 6 decimals — a placeholder first-pass number, not tuned

// Same technique FloorwarsCards.ts already uses — the revertedWithCustomError matcher crashed
// the whole mocha run in this environment regardless of gas overrides, so revert assertions here
// check the real on-chain revert message directly via try/catch instead.
async function expectRevert(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (err) {
    expect(String(err)).to.include(message);
    return;
  }
  expect.fail(`expected the call to revert with "${message}", but it succeeded`);
}

describe("FloorwarsStore", function () {
  async function deploy() {
    const [owner, buyer, other, newTreasury] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20");
    await token.mint(buyer.address, PRICE * 10n);
    const store = await ethers.deployContract("FloorwarsStore", [await token.getAddress(), owner.address, PRICE, owner.address]);
    return { store, token, owner, buyer, other, newTreasury };
  }

  it("takes payment via transferFrom (after approval) and forwards it to the treasury", async function () {
    const { store, token, owner, buyer } = await deploy();
    await token.connect(buyer).approve(await store.getAddress(), PRICE);

    const intentId = ethers.hexlify(ethers.randomBytes(32));
    await store.connect(buyer).purchaseFoundersSet(intentId);

    expect(await token.balanceOf(owner.address)).to.equal(PRICE); // owner doubles as treasury in this fixture
    expect(await token.balanceOf(buyer.address)).to.equal(PRICE * 9n);
    expect(await store.purchased(intentId)).to.equal(true);
  });

  it("emits Purchase with the buyer, the exact intentId, and the price", async function () {
    const { store, token, buyer } = await deploy();
    await token.connect(buyer).approve(await store.getAddress(), PRICE);
    const intentId = ethers.hexlify(ethers.randomBytes(32));

    const tx = await store.connect(buyer).purchaseFoundersSet(intentId);
    const receipt = await tx.wait();
    const events = await store.queryFilter(store.filters.Purchase(), receipt!.blockNumber, receipt!.blockNumber);
    expect(events).to.have.lengthOf(1);
    expect(events[0].args.buyer).to.equal(buyer.address);
    expect(events[0].args.intentId).to.equal(intentId);
    expect(events[0].args.amount).to.equal(PRICE);
  });

  it("rejects reusing the same intentId, even from a different buyer", async function () {
    const { store, token, buyer, other } = await deploy();
    await token.mint(other.address, PRICE);
    await token.connect(buyer).approve(await store.getAddress(), PRICE);
    await token.connect(other).approve(await store.getAddress(), PRICE);

    const intentId = ethers.hexlify(ethers.randomBytes(32));
    await store.connect(buyer).purchaseFoundersSet(intentId);

    await expectRevert(store.connect(other).purchaseFoundersSet(intentId), "intent already used");
  });

  it("reverts without a prior approval, and without touching the used-intent map", async function () {
    const { store, buyer } = await deploy();
    const intentId = ethers.hexlify(ethers.randomBytes(32));

    await expectRevert(store.connect(buyer).purchaseFoundersSet(intentId), "ERC20InsufficientAllowance");
    expect(await store.purchased(intentId)).to.equal(false); // the revert rolls back purchased[intentId]'s write too; pins the intended end state either way
  });

  it("reverts on insufficient balance even with a large-enough approval", async function () {
    const { store, token, other } = await deploy();
    // `other` never got minted any tokens.
    await token.connect(other).approve(await store.getAddress(), PRICE);
    await expectRevert(store.connect(other).purchaseFoundersSet(ethers.hexlify(ethers.randomBytes(32))), "ERC20InsufficientBalance");
  });

  it("lets the owner change price and treasury, and rejects both from a non-owner", async function () {
    const { store, owner, other, newTreasury } = await deploy();

    await store.connect(owner).setPrice(PRICE * 2n);
    expect(await store.price()).to.equal(PRICE * 2n);

    await store.connect(owner).setTreasury(newTreasury.address);
    expect(await store.treasury()).to.equal(newTreasury.address);

    await expectRevert(store.connect(other).setPrice(1n), "OwnableUnauthorizedAccount");
    await expectRevert(store.connect(other).setTreasury(other.address), "OwnableUnauthorizedAccount");
  });

  it("rejects setting the treasury to the zero address", async function () {
    const { store, owner } = await deploy();
    await expectRevert(store.connect(owner).setTreasury(ethers.ZeroAddress), "zero address");
  });

  it("a changed treasury receives subsequent payments, not the old one", async function () {
    const { store, token, owner, buyer, newTreasury } = await deploy();
    await store.connect(owner).setTreasury(newTreasury.address);
    await token.connect(buyer).approve(await store.getAddress(), PRICE);

    await store.connect(buyer).purchaseFoundersSet(ethers.hexlify(ethers.randomBytes(32)));

    expect(await token.balanceOf(newTreasury.address)).to.equal(PRICE);
    expect(await token.balanceOf(owner.address)).to.equal(0n);
  });
});
