import { getAddress } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { SiweMessage } from "siwe";
import { apiFetch } from "./api.js";

const STORAGE_KEY = "cryptoclash.session";

interface StoredSession {
  token: string;
  walletAddress: string;
}

/** Minimal EIP-1193 injected provider surface — just what connecting + signing needs. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
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

      const result = await apiFetch<{ token: string; account: { walletAddress: string } }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
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

  return { status, walletAddress, token, error, connect, disconnect };
}
