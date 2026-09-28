// Generates a throwaway deployer/operator wallet for the testnet groundwork in this workspace.
// Deliberately not a Hardhat script (`hardhat run`) — this doesn't touch any network, so there's
// no reason to pay Hardhat's network-bootstrap cost for it.
//
// Usage: npm run generate-wallet --workspace=web3
// Then: fund the printed address via https://faucet.testnet.chain.robinhood.com and paste the
// printed private key into web3/.env as WEB3_OPERATOR_PRIVATE_KEY (gitignored, never commit it).
import { Wallet } from "ethers";

const wallet = Wallet.createRandom();

console.log("Generated a new testnet-only wallet. This has zero value until funded via a faucet —");
console.log("never reuse this key for anything real.\n");
console.log(`Address:     ${wallet.address}`);
console.log(`Private key: ${wallet.privateKey}`);
console.log("\nNext steps:");
console.log("1. Paste the private key into web3/.env as WEB3_OPERATOR_PRIVATE_KEY");
console.log(`2. Fund the address at https://faucet.testnet.chain.robinhood.com`);
