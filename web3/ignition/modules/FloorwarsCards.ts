import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// The initial owner (and the account this workspace's ChainClient signs mints as) is the
// deployer itself — WEB3_OPERATOR_PRIVATE_KEY's address, per hardhat.config.ts's network
// account config. A production deployment would likely want a separate, more carefully
// custodied owner address; this groundwork keeps deployer == owner for simplicity.
export default buildModule("FloorwarsCardsModule", (m) => {
  const deployer = m.getAccount(0);
  const baseUri = m.getParameter("baseUri", "https://floorwars.app/api/metadata/{id}.json");

  const cards = m.contract("FloorwarsCards", [baseUri, deployer]);

  return { cards };
});
