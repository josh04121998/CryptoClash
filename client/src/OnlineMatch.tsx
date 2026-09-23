import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { MatchView } from "./components/MatchView.js";
import { MuteToggle } from "./components/MuteToggle.js";
import { playRewardSound } from "./sound.js";
import { track } from "./telemetry.js";
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

  // Telemetry state. Refs, not React state: nothing renders off them, and they
  // have to survive StrictMode's dev double-invoke of the mount effects.
  //
  // NOTE: `queue_waited` and `bot_fallback_shown` are deliberately NOT wired
  // here — they belong with the bot-fallback branch, which isn't in this
  // checkout, and are being wired on that branch instead.
  const startedRef = useRef(false);
  const endedRef = useRef(false);

  useEffect(() => {
    if (status !== "in-match" || startedRef.current) return;
    startedRef.current = true;
    track("match_started", { mode: "online" });
  }, [status]);

  useEffect(() => {
    if (!state?.winner || !playerId || endedRef.current) return;
    endedRef.current = true;
    track("match_ended", {
      mode: "online",
      result: state.winner === "Draw" ? "draw" : state.winner === playerId ? "win" : "loss",
      turns: state.turnNumber,
    });
  }, [state, playerId]);

  /** Re-queueing ("Find another match" / "Retry") is a whole new match — re-arm both guards. */
  function findMatch() {
    startedRef.current = false;
    endedRef.current = false;
    connect(deckCards, token ?? undefined);
  }

  const prevRewardRef = useRef(reward);
  useEffect(() => {
    if (reward && reward !== prevRewardRef.current) playRewardSound();
    prevRewardRef.current = reward;
  }, [reward]);

  function handleExit() {
    // Walking out of a live, winner-less match is an abandon — same event as a
    // real finish, different `result`.
    if (status === "in-match" && state && !state.winner && !endedRef.current) {
      endedRef.current = true;
      track("match_ended", { mode: "online", result: "abandoned", turns: state.turnNumber });
    }
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
              {queuedSeconds >= 20 && (
                <p className="connect-status__hint">
                  Nobody's queued right now — try Play vs AI instead, or hang tight and we'll match you the moment someone joins.
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
              <button type="button" onClick={findMatch}>
                Find another match
              </button>
            </>
          )}
          {status === "error" && (
            <>
              <p>Couldn't reach the match server.</p>
              <button type="button" onClick={findMatch}>
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
