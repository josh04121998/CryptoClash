import { getAddress } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { SiweMessage } from "siwe";
import { apiFetch } from "./api.js";
import { consumeStoredReferralCode } from "./referral.js";

const STORAGE_KEY = "cryptoclash.session";

interface StoredSession {
  token: string;
  walletAddress: string;
}

/** Minimal EIP-1193 injected provider surface — just what connecting + signing needs. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  /**
   * Not part of the EIP-1193 base spec, but near-universal in practice
   * (MetaMask and every other major injected wallet implement it) — needed to
   * detect the user switching their wallet's active account from outside our
   * UI (the extension itself), which `eth_requestAccounts` alone can't do
   * since it only returns whatever's currently active without notifying us
   * of a later change.
   */
  on?(event: "accountsChanged", handler: (accounts: string[]) => void): void;
  removeListener?(event: "accountsChanged", handler: (accounts: string[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function storeSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled — the session just won't survive a reload.
  }
}

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Wallet-as-identity: connecting a wallet *is* signing in (Sign-In with
 * Ethereum, EIP-4361). No separate account system — the session token this
 * returns is what every authenticated API call (saving a deck, etc.) needs.
 * Play vs AI / Play Online never call this; it's opt-in, only needed to
 * persist anything.
 */
export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored) {
      setWalletAddress(stored.walletAddress);
      setToken(stored.token);
      setStatus("connected");
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!window.ethereum) {
      setStatus("error");
      setError("No wallet found — install MetaMask or another browser wallet extension.");
      return;
    }
    setStatus("connecting");
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("No account returned by the wallet.");
      // SIWE messages require an EIP-55 checksummed address (siwe's own validation throws
      // "invalid EIP-55 address" otherwise) — not every wallet returns one already checksummed
      // (some return all-lowercase), so normalize with ethers rather than trusting the wallet's casing.
      const address = getAddress(accounts[0]);

      const { nonce } = await apiFetch<{ nonce: string }>("/api/auth/nonce");
      const siwe = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CRYPTO CLASH.",
        uri: window.location.origin,
        version: "1",
        chainId: 1,
        nonce,
      });
      const message = siwe.prepareMessage();
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      // One-shot: consumed here regardless of outcome, so a garbled/expired code can't be
      // retried on every future connect attempt. Only ever matters for a brand-new account
      // (server-side, gated on Account.isNew) — a no-op for an existing account signing back in.
      const referralCode = consumeStoredReferralCode();
      const result = await apiFetch<{ token: string; account: { walletAddress: string } }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature, referralCode: referralCode ?? undefined }),
      });

      storeSession({ token: result.token, walletAddress: result.account.walletAddress });
      setWalletAddress(result.account.walletAddress);
      setToken(result.token);
      setStatus("connected");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }, []);

  const disconnect = useCallback(() => {
    storeSession(null);
    setWalletAddress(null);
    setToken(null);
    setStatus("disconnected");
  }, []);

  // Detect the active account changing *outside* our UI (switched in the wallet extension
  // itself while already connected here) — our session token was signed for the old
  // address via SIWE and isn't valid for the new one, so drop it rather than keep silently
  // acting as the stale account. Deliberately doesn't auto-re-sign — popping a fresh
  // signature prompt the instant someone switches accounts for an unrelated reason would be
  // surprising; asking them to hit Connect Wallet again is a clearer, expected interaction.
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.on) return;
    function handleAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) {
        disconnect();
        return;
      }
      const newAddress = getAddress(accounts[0]);
      if (walletAddress && newAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        storeSession(null);
        setToken(null);
        setWalletAddress(null);
        setStatus("disconnected");
        setError("Wallet account changed — click Connect Wallet to sign in with it.");
      }
    }
    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
  }, [walletAddress, disconnect]);

  /**
   * A plain eth_requestAccounts (what `connect` calls) won't show MetaMask's
   * account picker once the site is already authorized — it just silently
   * returns whichever account is currently active. `wallet_requestPermissions`
   * forces that picker back open so the user can actually pick a *different*
   * wallet/account to sign in as, then falls through to the normal connect
   * flow (fresh nonce + SIWE signature) for whichever address they land on.
   */
  const switchWallet = useCallback(async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch {
        // Picker dismissed, or the wallet doesn't support wallet_requestPermissions — either
        // way, fall through to connect() below, which reuses whatever account is active now.
      }
    }
    await connect();
  }, [connect]);

  return { status, walletAddress, token, error, connect, disconnect, switchWallet };
}
