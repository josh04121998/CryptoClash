// The actual live proof this groundwork works — not just "it compiles." Run against Robinhood
// Chain testnet after deploying (npm run deploy:testnet --workspace=web3) and setting
// WEB3_CONTRACT_ADDRESS in web3/.env: reads the operator's current balance of a test token id,
// mints one more, and re-reads to confirm the chain actually moved.
//
// Usage: npm run smoke:testnet --workspace=web3
import "dotenv/config";
import { network } from "hardhat";

const TEST_TOKEN_ID = 1n;
const MINT_AMOUNT = 1n;

async function main() {
  const contractAddress = process.env.WEB3_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("WEB3_CONTRACT_ADDRESS is not set — deploy first (npm run deploy:testnet --workspace=web3).");
  }

  const { ethers } = await network.create("robinhoodTestnet");
  const [operator] = await ethers.getSigners();
  const cards = await ethers.getContractAt("FloorwarsCards", contractAddress, operator);

  console.log(`Network: Robinhood Chain testnet (chain ID ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`Operator: ${operator.address}`);

  const balanceBefore = await cards.balanceOf(operator.address, TEST_TOKEN_ID);
  console.log(`\nBalance of token ${TEST_TOKEN_ID} before mint: ${balanceBefore}`);

  console.log(`Minting ${MINT_AMOUNT} of token ${TEST_TOKEN_ID} to self...`);
  const tx = await cards.mint(operator.address, TEST_TOKEN_ID, MINT_AMOUNT, "0x");
  console.log(`Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt?.blockNumber}`);

  const balanceAfter = await cards.balanceOf(operator.address, TEST_TOKEN_ID);
  console.log(`Balance of token ${TEST_TOKEN_ID} after mint: ${balanceAfter}`);

  if (balanceAfter !== balanceBefore + MINT_AMOUNT) {
    throw new Error(`Balance did not increase as expected (before=${balanceBefore}, after=${balanceAfter})`);
  }

  console.log("\nSmoke test passed — read and write both confirmed against a real testnet transaction.");
  console.log(`View on Blockscout: https://explorer.testnet.chain.robinhood.com/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
