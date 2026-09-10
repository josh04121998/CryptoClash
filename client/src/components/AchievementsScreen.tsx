import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";
import { playRewardSound } from "../sound.js";

export interface AchievementsScreenProps {
  token: string;
  balance: number | null;
  onBalanceChange: (balance: number) => void;
  onBack: () => void;
}

interface AchievementStatus {
  id: string;
  description: string;
  goal: number;
  rewardCoins: number;
  progress: number;
  claimed: boolean;
}

/**
 * spec.md Section 21's "Achievements" Coins source — permanent, one-time milestones, unlike
 * Quests' daily reset (QuestsScreen.tsx). Same list/progress-bar/claim-button visual pattern as
 * QuestsScreen (reuses its `.quests-screen`/`.quests-screen__quest` CSS classes directly rather
 * than duplicating them), just without the "resets tomorrow" framing.
 */
export function AchievementsScreen({ token, balance, onBalanceChange, onBack }: AchievementsScreenProps) {
  const [achievements, setAchievements] = useState<AchievementStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ achievements: AchievementStatus[] }>("/api/achievements", { token })
      .then((res) => setAchievements(res.achievements))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function claim(achievement: AchievementStatus) {
    setBusyId(achievement.id);
    setActionError(null);
    try {
      const result = await apiFetch<{ coinsEarned: number; balance: number }>(`/api/achievements/${achievement.id}/claim`, {
        method: "POST",
        token,
      });
      onBalanceChange(result.balance);
      setAchievements((as) => as.map((a) => (a.id === achievement.id ? { ...a, claimed: true } : a)));
      playRewardSound();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const claimedCount = achievements.filter((a) => a.claimed).length;

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">achievements</span>
        <div className="app-bar__actions">
          <span className="app-bar__coins" title="Coins" aria-label={`Coins: ${balance ?? "loading"}`}>
            🪙 {balance ?? "…"}
          </span>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="quests-screen">
        <p className="crafting__intro">
          Permanent milestones — unlike Quests, these never reset. {claimedCount}/{achievements.length || "…"} claimed.
        </p>
        {error && <p className="deck-picker__empty">Couldn't load achievements: {error}</p>}
        {loading && <p className="deck-picker__prompt">Loading…</p>}
        {actionError && (
          <p className="crafting__error" role="status" aria-live="polite">
            {actionError}
          </p>
        )}

        {!loading && !error && (
          <div className="quests-screen__list">
            {achievements.map((a) => {
              const complete = a.progress >= a.goal;
              return (
                <div key={a.id} className="quests-screen__quest">
                  <div className="quests-screen__quest-info">
                    <span className="quests-screen__quest-title">{a.description}</span>
                    <div
                      className="quests-screen__progress-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={a.goal}
                      aria-valuenow={Math.min(a.progress, a.goal)}
                      aria-label={`${a.description} progress`}
                    >
                      <div
                        className="quests-screen__progress-fill"
                        style={{ width: `${Math.min(100, (a.progress / a.goal) * 100)}%` }}
                      />
                    </div>
                    <span className="quests-screen__quest-desc">
                      {Math.min(a.progress, a.goal)}/{a.goal} · {a.rewardCoins} 🪙
                    </span>
                  </div>
                  <button type="button" disabled={!complete || a.claimed || busyId === a.id} onClick={() => claim(a)}>
                    {a.claimed ? "Claimed" : complete ? "Claim" : "Locked"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
