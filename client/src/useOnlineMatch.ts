import { Intent, MatchState, PlayerId } from "@cryptoclash/engine";
import { ClientMessage, ServerMessage, deserializeState } from "@cryptoclash/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "queued"
  | "in-match"
  // A socket dropped unexpectedly mid-match and a fresh connection is being
  // attempted automatically — `state`/`playerId` are left as-is (the last
  // known board), so the UI can keep rendering it under a transient banner
  // instead of dropping to a dead screen. See OnlineMatch.tsx.
  | "reconnecting"
  | "opponent-left"
  | "error";

export interface MatchReward {
  coinsEarned: number;
  balance: number;
}

const DEFAULT_SERVER_URL = "ws://localhost:8787";

/** How long to wait before each automatic reconnect attempt after an unexpected close. */
const RECONNECT_RETRY_DELAY_MS = 2000;
/** Caps automatic reconnect attempts so a genuinely dead connection eventually surfaces as an error instead of retrying forever — comfortably covers the server's ~45s reconnect grace period at the retry delay above. */
const MAX_RECONNECT_ATTEMPTS = 25;

/**
 * VITE_SERVER_URL is easy to paste in as the host's https:// URL (that's
 * what Railway etc. show you) — the WebSocket constructor requires ws(s)://,
 * so normalize rather than fail with an unhelpful SyntaxError.
 */
function toWebSocketUrl(url: string): string {
  return url.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
}

export function serverUrl(): string {
  const configured = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? DEFAULT_SERVER_URL;
  return toWebSocketUrl(configured);
}

/** Same shape as useMatch, but state is pushed by the match server over a WebSocket instead of computed locally. */
export function useOnlineMatch() {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [reward, setReward] = useState<MatchReward | null>(null);
  // Whether the *opponent's* socket is currently known to be connected — flips false on
  // `opponentDisconnected`, true again on `opponentReconnected` (or a fresh matchFound).
  const [opponentConnected, setOpponentConnected] = useState(true);

  // The per-seat secret handed out on matchFound/reconnected — presented back on a `reconnect`
  // attempt to prove "this is the same seat." Held in a ref (not state) since it's plumbing, not
  // something a render depends on.
  const reconnectTokenRef = useRef<string | null>(null);
  const cardsRef = useRef<string[] | undefined>(undefined);
  const tokenRef = useRef<string | undefined>(undefined);
  // Set right before an intentional close (disconnect()/unmount) so the socket's onclose handler
  // knows not to treat it as a drop worth auto-reconnecting from.
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  const openSocketRef = useRef<(mode: "find" | "reconnect") => void>(() => {});

  const openSocket = useCallback((mode: "find" | "reconnect") => {
    intentionalCloseRef.current = false;
    const socket = new WebSocket(serverUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      if (mode === "find") {
        setStatus("queued");
        socket.send(JSON.stringify({ type: "findMatch", cards: cardsRef.current, token: tokenRef.current } satisfies ClientMessage));
      } else {
        socket.send(
          JSON.stringify({ type: "reconnect", reconnectToken: reconnectTokenRef.current ?? undefined, token: tokenRef.current } satisfies ClientMessage),
        );
      }
    };

    socket.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      switch (message.type) {
        case "queued":
          setStatus("queued");
          break;
        case "matchFound":
          reconnectAttemptsRef.current = 0;
          reconnectTokenRef.current = message.reconnectToken;
          setPlayerId(message.playerId);
          setState(deserializeState(message.state));
          setOpponentConnected(true);
          setStatus("in-match");
          break;
        case "reconnected":
          reconnectAttemptsRef.current = 0;
          setPlayerId(message.playerId);
          setState(deserializeState(message.state));
          setOpponentConnected(true);
          setStatus("in-match");
          break;
        case "reconnectFailed":
          // The held match is gone for good (unknown/expired token, or the grace period already
          // lapsed) — same dead-end UI as a real opponentLeft.
          setStatus("opponent-left");
          break;
        case "state":
          setState(deserializeState(message.state));
          break;
        case "error":
          setLastError(message.message);
          break;
        case "opponentDisconnected":
          setOpponentConnected(false);
          break;
        case "opponentReconnected":
          setOpponentConnected(true);
          break;
        case "opponentLeft":
          setStatus("opponent-left");
          break;
        case "matchReward":
          setReward({ coinsEarned: message.coinsEarned, balance: message.balance });
          break;
      }
    };

    // A browser WebSocket always follows an error with a close shortly after — let onclose be
    // the single place that decides "retry or give up" rather than racing two handlers.
    socket.onerror = () => {};

    socket.onclose = () => {
      if (intentionalCloseRef.current) return;
      // Only worth auto-reconnecting once there's an actual seat to resume (we've seen at least
      // one matchFound/reconnected) — a drop while still connecting/queued just surfaces as an error.
      if (reconnectTokenRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        setStatus("reconnecting");
        setTimeout(() => openSocketRef.current("reconnect"), RECONNECT_RETRY_DELAY_MS);
      } else {
        setStatus("error");
      }
    };
  }, []);

  useEffect(() => {
    openSocketRef.current = openSocket;
  }, [openSocket]);

  const send = useCallback((message: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
  }, []);

  const connect = useCallback(
    (cards?: string[], token?: string) => {
      cardsRef.current = cards;
      tokenRef.current = token;
      reconnectTokenRef.current = null;
      reconnectAttemptsRef.current = 0;
      setStatus("connecting");
      setLastError(null);
      setReward(null);
      setOpponentConnected(true);
      openSocket("find");
    },
    [openSocket],
  );

  const dispatch = useCallback(
    (intent: Intent) => {
      setLastError(null);
      send({ type: "intent", intent });
    },
    [send],
  );

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    send({ type: "leave" });
    socketRef.current?.close();
    socketRef.current = null;
    reconnectTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    setStatus("idle");
    setState(null);
    setPlayerId(null);
    setLastError(null);
    setReward(null);
    setOpponentConnected(true);
  }, [send]);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      socketRef.current?.close();
    };
  }, []);

  return { status, playerId, state, dispatch, connect, disconnect, lastError, reward, opponentConnected };
}
