import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Chain choice (session 35): Robinhood Chain, an EVM-compatible Arbitrum Orbit L2 — see
// STATUS.md and architecture.md Section 8 for the full reasoning. Testnet only in this
// workspace; there is deliberately no mainnet network entry yet (no real minting this pass).
export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    // Local in-memory network — used by `hardhat test`, free and instant.
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // configVariable reads WEB3_RPC_URL / WEB3_OPERATOR_PRIVATE_KEY from the environment
    // (this file loads web3/.env via "dotenv/config" above) — see .env.example.
    // chainType "generic" rather than "l1"/"op": Robinhood Chain is an Arbitrum Orbit L2,
    // neither plain L1 semantics nor OP-stack's deposit-transaction semantics.
    robinhoodTestnet: {
      type: "http",
      chainType: "generic",
      chainId: 46630,
      url: configVariable("WEB3_RPC_URL"),
      accounts: [configVariable("WEB3_OPERATOR_PRIVATE_KEY")],
    },
  },
});
