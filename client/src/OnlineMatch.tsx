import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { LocalMatch } from "./LocalMatch.js";
import { MatchView } from "./components/MatchView.js";
import { MuteToggle } from "./components/MuteToggle.js";
import { shouldFallBackToBot, shouldShowQueueHint } from "./queueFallback.js";
import { playRewardSound } from "./sound.js";
import { useOnlineMatch } from "./useOnlineMatch.js";

export interface OnlineMatchProps {
  deckCards: string[];
  token?: string | null;
  onExit: () => void;
}

export function OnlineMatch({ deckCards, token, onExit }: OnlineMatchProps) {
  const { status, playerId, state, dispatch, connect, disconnect, lastError, reward, opponentConnected } = useOnlineMatch();
  const [logOpen, setLogOpen] = useState(false);
  const [queuedSeconds, setQueuedSeconds] = useState(0);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // Set once the queue gives up and hands over to a bot match (see queueFallback.ts).
  const [botFallback, setBotFallback] = useState(false);
  // Set when the player explicitly goes back to wait for a real opponent, which
  // suppresses the automatic fallback from re-firing 20 seconds later.
  const [waitingByChoice, setWaitingByChoice] = useState(false);

  useEffect(() => {
    connect(deckCards, token ?? undefined);
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "queued") {
      setQueuedSeconds(0);
      return;
    }
    const timer = setInterval(() => setQueuedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Nobody to match with: stop spinning and give the player an actual game.
  // Drops the queue slot first so the server isn't holding a session that has
  // already moved on — re-queuing goes through "Wait for a real opponent".
  useEffect(() => {
    if (!shouldFallBackToBot({ status, queuedSeconds, waitingByChoice })) return;
    disconnect();
    setBotFallback(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, queuedSeconds, waitingByChoice]);

  const prevRewardRef = useRef(reward);
  useEffect(() => {
    if (reward && reward !== prevRewardRef.current) playRewardSound();
    prevRewardRef.current = reward;
  }, [reward]);

  function handleExit() {
    disconnect();
    onExit();
  }

  // A real playtest flag (same one LocalMatch.tsx fixes): the header's "Leave" had no
  // confirmation, so a stray click mid-match silently forfeited it — worse here than in
  // Play vs AI, since it also drops the opponent. Only gate the in-progress, no-winner case;
  // "Cancel" while still queued, or leaving after a real winner exists, has nothing to lose.
  function requestLeave() {
    if (status === "in-match" && state && !state.winner) setConfirmingLeave(true);
    else handleExit();
  }

  function backToQueue() {
    setBotFallback(false);
    setWaitingByChoice(true);
    connect(deckCards, token ?? undefined);
  }

  // Reuses LocalMatch wholesale rather than rebuilding a board: it already owns
  // the bot loop, the match log, New Match, and confirm-before-leaving.
  if (botFallback) {
    return (
      <LocalMatch
        deckCards={deckCards}
        onExit={onExit}
        subtitle="practice — vs. bot"
        notice={
          <>
            <span>
              No one else was queued, so you're playing the bot. This is a practice match — it doesn't count toward rank, quests or the
              leaderboard.
            </span>
            <button type="button" onClick={backToQueue}>
              Wait for a real opponent
            </button>
          </>
        }
      />
    );
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>FLOORWARS</h1>
        <span className="app-bar__subtitle">multiplayer</span>
        <div className="app-bar__actions">
          <MuteToggle />
          {reward && (
            <span className="match-reward" role="status" aria-live="polite">
              +{reward.coinsEarned} Coins
            </span>
          )}
          {status === "in-match" && (
            <button type="button" onClick={() => setLogOpen((o) => !o)}>
              Log
            </button>
          )}
          <button type="button" onClick={requestLeave}>
            Leave
          </button>
        </div>
      </header>

      {(status === "in-match" || status === "reconnecting") && state && playerId ? (
        <>
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
          {status === "reconnecting" && (
            <div className="reconnect-banner" role="status">
              Connection dropped — reconnecting…
            </div>
          )}
          {status === "in-match" && !opponentConnected && (
            <div className="reconnect-banner" role="status">
              Opponent disconnected — waiting for them to reconnect…
            </div>
          )}
        </>
      ) : (
        <main className="connect-status">
          {status === "connecting" && <p>Connecting to the match server…</p>}
          {status === "queued" && (
            <>
              <p>Looking for an opponent…{queuedSeconds > 0 ? ` (${queuedSeconds}s)` : ""}</p>
              {shouldShowQueueHint({ status, queuedSeconds, waitingByChoice }) && (
                <p className="connect-status__hint">
                  {waitingByChoice
                    ? "Still nobody queued — we'll match you the moment someone joins."
                    : "Nobody's queued right now — we'll start you against the bot shortly, and match you the moment a real opponent joins."}
                </p>
              )}
              <button type="button" onClick={handleExit}>
                Cancel
              </button>
            </>
          )}
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

      {confirmingLeave && (
        <ConfirmModal
          title="Leave this match?"
          body="Your opponent wins if you leave now — this can't be undone."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => {
            setConfirmingLeave(false);
            handleExit();
          }}
          onCancel={() => setConfirmingLeave(false)}
        />
      )}
    </div>
  );
}
