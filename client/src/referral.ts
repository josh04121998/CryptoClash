const STORAGE_KEY = "cryptoclash.referralCode";

/**
 * Called once at app startup. If the URL carries `?ref=CODE` (someone followed
 * an invite link), stash it in localStorage so it survives however long it
 * takes the visitor to actually connect a wallet — could be immediately, could
 * be after browsing Play vs AI first. Only ever set when the param is present,
 * so revisiting without one can't accidentally clear an already-captured code.
 */
export function captureReferralFromUrl(): void {
  const code = new URLSearchParams(window.location.search).get("ref");
  if (!code) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private browsing / storage disabled — the code just won't survive to sign-in.
  }
}

/** Reads and clears the stored code — one-shot, consumed by the next sign-in attempt (successful or not, so a bad code can't be retried forever). */
export function consumeStoredReferralCode(): string | null {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    return code;
  } catch {
    return null;
  }
}
