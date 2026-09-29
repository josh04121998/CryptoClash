import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Real deployment (session 38): user-confirmed testnet USDG (0x7E955252E15c84f5768B83c41a71F9eba181802F,
// "Global Dollar", 6 decimals — the testnet has multiple look-alike "USDG"-symbol tokens, this one
// was never guessed at) at 0x585a2E58120F8555B1a390c0ae87C80a0850e651. Same deployer-is-owner
// simplicity as FloorwarsCards' own module.
export default buildModule("FloorwarsStoreModule", (m) => {
  const deployer = m.getAccount(0);
  const paymentToken = m.getParameter("paymentToken"); // the confirmed USDG address, no default — must be passed explicitly
  const treasury = m.getParameter("treasury", deployer);
  const price = m.getParameter("price", 7_990_000n); // $7.99 at USDG's 6 decimals — the user's real pricing decision (session 38); owner-settable via setPrice() if it changes again

  const store = m.contract("FloorwarsStore", [paymentToken, treasury, price, deployer]);

  return { store };
});
