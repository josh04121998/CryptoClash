import { Wallet } from "ethers";
import { SiweMessage } from "siwe";
import { beforeEach, describe, expect, it } from "vitest";
import { issueNonce, issueSessionToken, pruneExpiredNonces, verifySessionToken, verifySiwe } from "../src/auth.js";

const DOMAIN = "cryptoclash.test";

async function signInWith(wallet: Wallet, overrides: Partial<{ domain: string; nonce: string }> = {}) {
  const nonce = overrides.nonce ?? issueNonce();
  const siwe = new SiweMessage({
    domain: overrides.domain ?? DOMAIN,
    address: wallet.address,
    statement: "Sign in to CRYPTO CLASH.",
    uri: `https://${overrides.domain ?? DOMAIN}`,
    version: "1",
    chainId: 1,
    nonce,
  });
  const message = siwe.prepareMessage();
  const signature = await wallet.signMessage(message);
  return { message, signature };
}

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
});

describe("verifySiwe", () => {
  it("accepts a correctly signed message with a valid, freshly issued nonce", async () => {
    const wallet = Wallet.createRandom();
    const { message, signature } = await signInWith(wallet);

    const result = await verifySiwe(message, signature, DOMAIN);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.address).toBe(wallet.address.toLowerCase());
  });

  it("rejects a signature from a different wallet than the message claims", async () => {
    const claimedWallet = Wallet.createRandom();
    const actualSigner = Wallet.createRandom();
    const nonce = issueNonce();
    const siwe = new SiweMessage({
      domain: DOMAIN,
      address: claimedWallet.address, // claims to be `claimedWallet`...
      statement: "Sign in to CRYPTO CLASH.",
      uri: `https://${DOMAIN}`,
      version: "1",
      chainId: 1,
      nonce,
    });
    const message = siwe.prepareMessage();
    const signature = await actualSigner.signMessage(message); // ...but is actually signed by someone else.

    const result = await verifySiwe(message, signature, DOMAIN);
    expect(result.ok).toBe(false);
  });

  it("rejects a reused nonce (replay protection)", async () => {
    const wallet = Wallet.createRandom();
    const nonce = issueNonce();
    const first = await signInWith(wallet, { nonce });
    expect((await verifySiwe(first.message, first.signature, DOMAIN)).ok).toBe(true);

    // Same nonce, signed again — the nonce was already consumed by the first verify.
    const second = await signInWith(wallet, { nonce });
    const result = await verifySiwe(second.message, second.signature, DOMAIN);
    expect(result.ok).toBe(false);
  });

  it("rejects a nonce that was never issued", async () => {
    const wallet = Wallet.createRandom();
    // Syntactically valid (alphanumeric, EIP-4361-legal) but never handed out by issueNonce().
    const { message, signature } = await signInWith(wallet, { nonce: "neverIssuedNonceValue123" });
    const result = await verifySiwe(message, signature, DOMAIN);
    expect(result.ok).toBe(false);
  });

  it("rejects a message signed for a different domain (prevents cross-app replay)", async () => {
    const wallet = Wallet.createRandom();
    const { message, signature } = await signInWith(wallet, { domain: "evil.example" });
    const result = await verifySiwe(message, signature, DOMAIN);
    expect(result.ok).toBe(false);
  });

  it("pruneExpiredNonces doesn't throw and is a safe no-op with no expired entries", () => {
    expect(() => pruneExpiredNonces()).not.toThrow();
  });
});

describe("session tokens", () => {
  it("round-trips accountId and walletAddress through issue/verify", async () => {
    const token = await issueSessionToken({ accountId: "acc_123", walletAddress: "0xabc" });
    const claims = await verifySessionToken(token);
    expect(claims).toEqual({ accountId: "acc_123", walletAddress: "0xabc" });
  });

  it("rejects a garbage token", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await issueSessionToken({ accountId: "acc_123", walletAddress: "0xabc" });
    process.env.JWT_SECRET = "a-different-secret";
    expect(await verifySessionToken(token)).toBeNull();
  });
});
