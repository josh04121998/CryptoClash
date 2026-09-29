import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploy with real params once the real USDG contract address is confirmed (STATUS.md session
// 37/38 flags this as genuinely unconfirmed — the testnet has multiple look-alike "USDG" symbol
// tokens, and this must never be guessed at). Same deployer-is-owner simplicity as
// FloorwarsCards' own module.
export default buildModule("FloorwarsStoreModule", (m) => {
  const deployer = m.getAccount(0);
  const paymentToken = m.getParameter("paymentToken"); // the confirmed USDG address, no default — must be passed explicitly
  const treasury = m.getParameter("treasury", deployer);
  const price = m.getParameter("price", 25_000_000n); // $25.00 at USDG's 6 decimals — a placeholder first-pass number, not tuned

  const store = m.contract("FloorwarsStore", [paymentToken, treasury, price, deployer]);

  return { store };
});
