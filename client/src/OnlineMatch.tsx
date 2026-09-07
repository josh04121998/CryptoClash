import { useEffect, useState } from "react";
import { MatchView } from "./components/MatchView.js";
import { useOnlineMatch } from "./useOnlineMatch.js";

export interface OnlineMatchProps {
  deckCards: string[];
  token?: string | null;
  onExit: () => void;
}

export function OnlineMatch({ deckCards, token, onExit }: OnlineMatchProps) {
  const { status, playerId, state, dispatch, connect, disconnect, lastError, reward } = useOnlineMatch();
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    connect(deckCards, token ?? undefined);
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleExit() {
    disconnect();
    onExit();
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">multiplayer</span>
        <div className="app-bar__actions">
          {reward && <span className="match-reward">+{reward.coinsEarned} Coins</span>}
          {status === "in-match" && (
            <button type="button" onClick={() => setLogOpen((o) => !o)}>
              Log
            </button>
          )}
          <button type="button" onClick={handleExit}>
            Leave
          </button>
        </div>
      </header>

      {status === "in-match" && state && playerId ? (
        <MatchView
          state={state}
          myPlayerId={playerId}
          dispatch={dispatch}
          lastError={lastError}
          myLabel="You"
          opponentLabel="Opponent"
          opponentTurnLabel="Waiting for opponent…"
          logOpen={logOpen}
          onCloseLog={() => setLogOpen(false)}
        />
      ) : (
        <main className="connect-status">
          {status === "connecting" && <p>Connecting to the match server…</p>}
          {status === "queued" && <p>Looking for an opponent…</p>}
          {status === "opponent-left" && (
            <>
              <p>Your opponent disconnected.</p>
              <button type="button" onClick={() => connect(deckCards, token ?? undefined)}>
                Find another match
              </button>
            </>
          )}
          {status === "error" && (
            <>
              <p>Couldn't reach the match server.</p>
              <button type="button" onClick={() => connect(deckCards, token ?? undefined)}>
                Retry
              </button>
            </>
          )}
        </main>
      )}
    </div>
  );
}
