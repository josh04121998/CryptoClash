import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";
import { playRewardSound } from "../sound.js";

export interface QuestsScreenProps {
  token: string;
  balance: number | null;
  onBalanceChange: (balance: number) => void;
  onBack: () => void;
}

interface DailyStatus {
  streak: number;
  claimedToday: boolean;
  nextRewardCoins: number;
}

interface WeeklyStatus {
  streak: number;
  claimedThisWeek: boolean;
  nextRewardCoins: number;
}

interface QuestStatus {
  id: string;
  description: string;
  goal: number;
  rewardCoins: number;
  progress: number;
  claimed: boolean;
}

export function QuestsScreen({ token, balance, onBalanceChange, onBack }: QuestsScreenProps) {
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [weekly, setWeekly] = useState<WeeklyStatus | null>(null);
  const [quests, setQuests] = useState<QuestStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<DailyStatus>("/api/daily", { token }),
      apiFetch<WeeklyStatus>("/api/weekly", { token }),
      apiFetch<{ quests: QuestStatus[] }>("/api/quests", { token }),
    ])
      .then(([dailyRes, weeklyRes, questsRes]) => {
        setDaily(dailyRes);
        setWeekly(weeklyRes);
        setQuests(questsRes.quests);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function claimDaily() {
    setBusyId("daily");
    setActionError(null);
    try {
      const result = await apiFetch<{ coinsEarned: number; streak: number; balance: number }>("/api/daily/claim", {
        method: "POST",
        token,
      });
      onBalanceChange(result.balance);
      setDaily((d) => (d ? { ...d, claimedToday: true, streak: result.streak } : d));
      playRewardSound();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function claimWeekly() {
    setBusyId("weekly");
    setActionError(null);
    try {
      const result = await apiFetch<{ coinsEarned: number; streak: number; balance: number }>("/api/weekly/claim", {
        method: "POST",
        token,
      });
      onBalanceChange(result.balance);
      setWeekly((w) => (w ? { ...w, claimedThisWeek: true, streak: result.streak } : w));
      playRewardSound();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function claimQuest(quest: QuestStatus) {
    setBusyId(quest.id);
    setActionError(null);
    try {
      const result = await apiFetch<{ coinsEarned: number; balance: number }>(`/api/quests/${quest.id}/claim`, {
        method: "POST",
        token,
      });
      onBalanceChange(result.balance);
      setQuests((qs) => qs.map((q) => (q.id === quest.id ? { ...q, claimed: true } : q)));
      playRewardSound();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">quests</span>
        <div className="app-bar__actions">
          <span className="app-bar__coins" title="Coins">
            🪙 {balance ?? "…"}
          </span>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="quests-screen">
        <p className="crafting__intro">
          Play matches, win, and check back daily — this is where the Coins that pay for Packs and Crafting come from
          beyond the one-time welcome bonus.
        </p>
        {error && <p className="deck-picker__empty">Couldn't load quests: {error}</p>}
        {loading && <p className="deck-picker__prompt">Loading…</p>}
        {actionError && <p className="crafting__error">{actionError}</p>}

        {!loading && !error && daily && (
          <div className="quests-screen__daily">
            <div className="quests-screen__daily-info">
              <span className="quests-screen__daily-title">Daily Login — Day {daily.streak || 0} streak</span>
              <span className="quests-screen__daily-desc">
                {daily.claimedToday ? "Come back tomorrow for the next reward." : `Claim today's reward: ${daily.nextRewardCoins} 🪙`}
              </span>
            </div>
            <button type="button" disabled={daily.claimedToday || busyId === "daily"} onClick={claimDaily}>
              {daily.claimedToday ? "Claimed" : `Claim ${daily.nextRewardCoins} 🪙`}
            </button>
          </div>
        )}

        {!loading && !error && weekly && (
          <div className="quests-screen__daily">
            <div className="quests-screen__daily-info">
              <span className="quests-screen__daily-title">Weekly Bonus — Week {weekly.streak || 0} streak</span>
              <span className="quests-screen__daily-desc">
                {weekly.claimedThisWeek
                  ? "Come back next week for the next reward."
                  : `Claim this week's reward: ${weekly.nextRewardCoins} 🪙`}
              </span>
            </div>
            <button type="button" disabled={weekly.claimedThisWeek || busyId === "weekly"} onClick={claimWeekly}>
              {weekly.claimedThisWeek ? "Claimed" : `Claim ${weekly.nextRewardCoins} 🪙`}
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="quests-screen__list">
            {quests.map((quest) => {
              const complete = quest.progress >= quest.goal;
              return (
                <div key={quest.id} className="quests-screen__quest">
                  <div className="quests-screen__quest-info">
                    <span className="quests-screen__quest-title">{quest.description}</span>
                    <div className="quests-screen__progress-bar">
                      <div
                        className="quests-screen__progress-fill"
                        style={{ width: `${Math.min(100, (quest.progress / quest.goal) * 100)}%` }}
                      />
                    </div>
                    <span className="quests-screen__quest-desc">
                      {Math.min(quest.progress, quest.goal)}/{quest.goal} · {quest.rewardCoins} 🪙
                    </span>
                  </div>
                  <button type="button" disabled={!complete || quest.claimed || busyId === quest.id} onClick={() => claimQuest(quest)}>
                    {quest.claimed ? "Claimed" : complete ? "Claim" : "In progress"}
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
