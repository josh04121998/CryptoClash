import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export interface ReferralScreenProps {
  token: string;
  onBack: () => void;
}

interface ReferralStats {
  code: string;
  totalReferred: number;
  rewarded: number;
  pending: number;
}

export function ReferralScreen({ token, onBack }: ReferralScreenProps) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<ReferralStats>("/api/referral", { token })
      .then(setStats)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  const link = stats ? `${window.location.origin}/?ref=${stats.code}` : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied/unavailable — the link is still selectable text either way.
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">invite friends</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="referral-screen">
        <p className="crafting__intro">
          Share your link — when a friend joins and plays their first match, you get a free pack. They get a free pack the
          moment they connect.
        </p>
        {error && <p className="deck-picker__empty">Couldn't load your invite link: {error}</p>}
        {loading && <p className="deck-picker__prompt">Loading…</p>}

        {!loading && !error && stats && (
          <>
            <div className="referral-screen__link-row">
              <code className="referral-screen__link">{link}</code>
              <button type="button" aria-live="polite" onClick={copyLink}>
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            <div className="referral-screen__stats">
              <div className="referral-screen__stat">
                <span className="referral-screen__stat-value">{stats.totalReferred}</span>
                <span className="referral-screen__stat-label">Invited</span>
              </div>
              <div className="referral-screen__stat">
                <span className="referral-screen__stat-value">{stats.rewarded}</span>
                <span className="referral-screen__stat-label">Free Packs Earned</span>
              </div>
              <div className="referral-screen__stat">
                <span className="referral-screen__stat-value">{stats.pending}</span>
                <span className="referral-screen__stat-label">Awaiting Their First Match</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
