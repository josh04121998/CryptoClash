import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export interface LeaderboardScreenProps {
  /** null when no wallet is connected — the board itself is public (no login wall to look), only "mine" needs identity. */
  token: string | null;
  onBack: () => void;
}

type Category = "wins" | "win-rate" | "coins-earned" | "rank";

interface RankedEntry {
  walletAddress: string;
  rank: number;
}
interface WinsEntry extends RankedEntry {
  wins: number;
}
interface CoinsEarnedEntry extends RankedEntry {
  coinsEarned: number;
}
interface WinRateEntry extends RankedEntry {
  wins: number;
  games: number;
  winRate: number;
}
interface RankTierInfo {
  name: string;
  minPoints: number;
}
interface RankEntry extends RankedEntry {
  points: number;
  tierName: string;
}

interface WinsResponse {
  entries: WinsEntry[];
  mine: { wins: number; rank: number | null } | null;
}
interface CoinsEarnedResponse {
  entries: CoinsEarnedEntry[];
  mine: { coinsEarned: number; rank: number | null } | null;
}
interface WinRateResponse {
  entries: WinRateEntry[];
  mine: { wins: number; games: number; winRate: number; rank: number | null; minGames: number } | null;
}
interface MyRank {
  points: number;
  tier: RankTierInfo;
  nextTier: RankTierInfo | null;
  pointsToNextTier: number | null;
  rank: number | null;
}
interface RankResponse {
  entries: RankEntry[];
  mine: MyRank | null;
}

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "wins", label: "Most Wins" },
  { id: "win-rate", label: "Win Rate" },
  { id: "coins-earned", label: "Coins Earned" },
  { id: "rank", label: "Ranked" },
];

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function LeaderboardScreen({ token, onBack }: LeaderboardScreenProps) {
  const [category, setCategory] = useState<Category>("wins");
  const [wins, setWins] = useState<WinsResponse | null>(null);
  const [winRate, setWinRate] = useState<WinRateResponse | null>(null);
  const [coinsEarned, setCoinsEarned] = useState<CoinsEarnedResponse | null>(null);
  const [rank, setRank] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const path = `/api/leaderboard/${category}`;
    apiFetch<WinsResponse | WinRateResponse | CoinsEarnedResponse | RankResponse>(path, token ? { token } : {})
      .then((res) => {
        if (category === "wins") setWins(res as WinsResponse);
        else if (category === "win-rate") setWinRate(res as WinRateResponse);
        else if (category === "rank") setRank(res as RankResponse);
        else setCoinsEarned(res as CoinsEarnedResponse);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [category, token]);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">leaderboard</span>
        <div className="app-bar__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <main className="leaderboard-screen">
        <div className="leaderboard-screen__tabs">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === category ? "leaderboard-screen__tab leaderboard-screen__tab--active" : "leaderboard-screen__tab"}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {error && <p className="deck-picker__empty">Couldn't load the leaderboard: {error}</p>}
        {loading && <p className="deck-picker__prompt">Loading…</p>}

        {!loading && !error && category === "wins" && wins && (
          <>
            <table className="leaderboard-screen__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Wins</th>
                </tr>
              </thead>
              <tbody>
                {wins.entries.map((e) => (
                  <tr key={e.walletAddress}>
                    <td>{e.rank}</td>
                    <td>{shortAddress(e.walletAddress)}</td>
                    <td>{e.wins}</td>
                  </tr>
                ))}
                {wins.entries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="leaderboard-screen__empty">
                      No Play Online wins yet — be the first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {token && wins.mine && (
              <p className="leaderboard-screen__mine">
                {wins.mine.rank ? `You're ranked #${wins.mine.rank} with ${wins.mine.wins} wins.` : "Win a Play Online match to appear here."}
              </p>
            )}
          </>
        )}

        {!loading && !error && category === "win-rate" && winRate && (
          <>
            <p className="crafting__intro">Ranked among players with at least {winRate.mine?.minGames ?? 5} Play Online matches.</p>
            <table className="leaderboard-screen__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Win Rate</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {winRate.entries.map((e) => (
                  <tr key={e.walletAddress}>
                    <td>{e.rank}</td>
                    <td>{shortAddress(e.walletAddress)}</td>
                    <td>{Math.round(e.winRate * 100)}%</td>
                    <td>
                      {e.wins}-{e.games - e.wins}
                    </td>
                  </tr>
                ))}
                {winRate.entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="leaderboard-screen__empty">
                      Nobody's played enough matches yet — be the first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {token && winRate.mine && (
              <p className="leaderboard-screen__mine">
                {winRate.mine.rank
                  ? `You're ranked #${winRate.mine.rank} at ${Math.round(winRate.mine.winRate * 100)}% (${winRate.mine.wins}-${winRate.mine.games - winRate.mine.wins}).`
                  : `Play ${winRate.mine.minGames - winRate.mine.games} more match${winRate.mine.minGames - winRate.mine.games === 1 ? "" : "es"} to qualify (${winRate.mine.games}/${winRate.mine.minGames}).`}
              </p>
            )}
          </>
        )}

        {!loading && !error && category === "coins-earned" && coinsEarned && (
          <>
            <table className="leaderboard-screen__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Coins Earned</th>
                </tr>
              </thead>
              <tbody>
                {coinsEarned.entries.map((e) => (
                  <tr key={e.walletAddress}>
                    <td>{e.rank}</td>
                    <td>{shortAddress(e.walletAddress)}</td>
                    <td>🪙 {e.coinsEarned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {token && coinsEarned.mine && (
              <p className="leaderboard-screen__mine">
                You're ranked #{coinsEarned.mine.rank} with 🪙 {coinsEarned.mine.coinsEarned} earned.
              </p>
            )}
          </>
        )}

        {!loading && !error && category === "rank" && rank && (
          <>
            <p className="crafting__intro">
              A placeholder points system (win +{20}/loss -{10}/draw +{5} per match, first design pass) mapped to
              Bronze/Silver/Gold/Platinum/Diamond tiers — not skill-based matchmaking, just a progression display.
            </p>
            <table className="leaderboard-screen__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Tier</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {rank.entries.map((e) => (
                  <tr key={e.walletAddress}>
                    <td>{e.rank}</td>
                    <td>{shortAddress(e.walletAddress)}</td>
                    <td>{e.tierName}</td>
                    <td>{e.points}</td>
                  </tr>
                ))}
                {rank.entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="leaderboard-screen__empty">
                      Nobody's played a ranked match yet — be the first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {token && rank.mine && (
              <p className="leaderboard-screen__mine">
                {rank.mine.rank ? `You're ranked #${rank.mine.rank} — ` : "You're "}
                {rank.mine.tier.name} ({rank.mine.points} pts)
                {rank.mine.nextTier
                  ? `, ${rank.mine.pointsToNextTier} to ${rank.mine.nextTier.name}.`
                  : " — top tier."}
              </p>
            )}
          </>
        )}

        {!token && (
          <p className="leaderboard-screen__connect-hint">Connect a wallet to see where you rank.</p>
        )}
      </main>
    </div>
  );
}
