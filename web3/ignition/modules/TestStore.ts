import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Throwaway deployment for live end-to-end verification of FloorwarsStore's purchase mechanism
// (session 37/38) — a MockERC20 the deployer fully controls, plus a second FloorwarsStore
// instance pointed at it, so the real integration test doesn't need real USDG (which has no
// scriptable faucet) or an unverifiable Uniswap router. Never referenced by production config —
// the real store (FloorwarsStoreModule, pointed at real USDG) is untouched by this.
export default buildModule("TestStoreModule", (m) => {
  const deployer = m.getAccount(0);
  const mockToken = m.contract("MockERC20");
  const store = m.contract("FloorwarsStore", [mockToken, deployer, 25_000_000n, deployer], { id: "TestFloorwarsStore" });

  return { mockToken, store };
});
