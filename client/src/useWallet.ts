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
export interface Eip1193Provider {
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

/**
 * EIP-6963 "Multi Injected Provider Discovery" — replaces the old assumption
 * that `window.ethereum` is *the* wallet. With more than one extension
 * installed (MetaMask + Coinbase Wallet + Rabby + Phantom's EVM mode, etc.),
 * `window.ethereum` is just whichever one happened to claim that global —
 * there was never a way for a user to actually pick between them. EIP-6963
 * wallets instead announce themselves as page-level events, so the app can
 * enumerate every installed wallet and let the user choose. `window.ethereum`
 * stays as the fallback for a wallet that hasn't adopted EIP-6963 yet.
 */
export interface DiscoveredWallet {
  uuid: string;
  name: string;
  icon: string;
}

interface Eip6963ProviderDetail {
  info: DiscoveredWallet;
  provider: Eip1193Provider;
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
  const [discoveredWallets, setDiscoveredWallets] = useState<Eip6963ProviderDetail[]>([]);
  // Whichever provider actually signed the current session — not always window.ethereum, once
  // there's more than one wallet to choose from — so accountsChanged/switchWallet target the
  // right extension instead of silently falling back to whatever window.ethereum points at.
  const [activeProvider, setActiveProvider] = useState<Eip1193Provider | null>(null);

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored) {
      setWalletAddress(stored.walletAddress);
      setToken(stored.token);
      setStatus("connected");
    }
  }, []);

  // Collect every EIP-6963-announcing wallet. `requestProvider` re-asks wallets that already
  // announced before this listener was attached (the common case — they announce on page load).
  useEffect(() => {
    function handleAnnounce(event: Event) {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      setDiscoveredWallets((prev) => (prev.some((w) => w.info.uuid === detail.info.uuid) ? prev : [...prev, detail]));
    }
    window.addEventListener("eip6963:announceProvider", handleAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handleAnnounce);
  }, []);

  const signInWith = useCallback(async (eth: Eip1193Provider) => {
    setError(null);
    setStatus("connecting");
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
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
      const signature = (await eth.request({
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
      setActiveProvider(eth);
      setStatus("connected");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }, []);

  /** Default path — used when there's zero or one wallet to choose between, so most users never see a picker. */
  const connect = useCallback(async () => {
    const eth = discoveredWallets[0]?.provider ?? window.ethereum;
    if (!eth) {
      setError("No wallet found — install MetaMask or another browser wallet extension.");
      setStatus("error");
      return;
    }
    await signInWith(eth);
  }, [discoveredWallets, signInWith]);

  /** Explicit pick from a multi-wallet picker (App.tsx shows one whenever discoveredWallets.length > 1). */
  const connectWithWallet = useCallback(
    async (uuid: string) => {
      const found = discoveredWallets.find((w) => w.info.uuid === uuid);
      if (!found) {
        setError("That wallet is no longer available — refresh and try again.");
        setStatus("error");
        return;
      }
      await signInWith(found.provider);
    },
    [discoveredWallets, signInWith],
  );

  const disconnect = useCallback(() => {
    storeSession(null);
    setWalletAddress(null);
    setToken(null);
    setActiveProvider(null);
    setStatus("disconnected");
  }, []);

  // Detect the active account changing *outside* our UI (switched in the wallet extension
  // itself while already connected here) — our session token was signed for the old
  // address via SIWE and isn't valid for the new one, so drop it rather than keep silently
  // acting as the stale account. Deliberately doesn't auto-re-sign — popping a fresh
  // signature prompt the instant someone switches accounts for an unrelated reason would be
  // surprising; asking them to hit Connect Wallet again is a clearer, expected interaction.
  useEffect(() => {
    const ethereum = activeProvider ?? window.ethereum;
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
        setActiveProvider(null);
        setStatus("disconnected");
        setError("Wallet account changed — click Connect Wallet to sign in with it.");
      }
    }
    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
  }, [walletAddress, activeProvider, disconnect]);

  /**
   * Switches *account* within the currently active wallet (or window.ethereum
   * if nothing's connected yet). Only the right tool when there's one wallet
   * to work with — when multiple are installed, App.tsx shows the wallet
   * picker instead so the user can pick a different *extension*, which this
   * can't do (it only ever re-prompts whichever provider it's given).
   *
   * A plain eth_requestAccounts (what `connect` calls) won't show MetaMask's
   * account picker once the site is already authorized — it just silently
   * returns whichever account is currently active. `wallet_requestPermissions`
   * forces that picker back open so the user can actually pick a *different*
   * account to sign in as, then falls through to the normal sign-in flow
   * (fresh nonce + SIWE signature) for whichever address they land on.
   */
  const switchWallet = useCallback(async () => {
    const eth = activeProvider ?? discoveredWallets[0]?.provider ?? window.ethereum;
    if (eth) {
      try {
        await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch {
        // Picker dismissed, or the wallet doesn't support wallet_requestPermissions — either
        // way, fall through below, which reuses whatever account is active now.
      }
      await signInWith(eth);
    } else {
      await connect();
    }
  }, [activeProvider, discoveredWallets, signInWith, connect]);

  return {
    status,
    walletAddress,
    token,
    error,
    connect,
    connectWithWallet,
    discoveredWallets: discoveredWallets.map((w) => w.info),
    disconnect,
    switchWallet,
  };
}
