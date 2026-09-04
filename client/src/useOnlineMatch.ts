import { Intent, MatchState, PlayerId } from "@cryptoclash/engine";
import { ClientMessage, ServerMessage, deserializeState } from "@cryptoclash/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "idle" | "connecting" | "queued" | "in-match" | "opponent-left" | "error";

const DEFAULT_SERVER_URL = "ws://localhost:8787";

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

  const send = useCallback((message: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
  }, []);

  const connect = useCallback((deckId?: string) => {
    setStatus("connecting");
    setLastError(null);
    const socket = new WebSocket(serverUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("queued");
      socket.send(JSON.stringify({ type: "findMatch", deckId } satisfies ClientMessage));
    };

    socket.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      switch (message.type) {
        case "queued":
          setStatus("queued");
          break;
        case "matchFound":
          setPlayerId(message.playerId);
          setState(deserializeState(message.state));
          setStatus("in-match");
          break;
        case "state":
          setState(deserializeState(message.state));
          break;
        case "error":
          setLastError(message.message);
          break;
        case "opponentLeft":
          setStatus("opponent-left");
          break;
      }
    };

    socket.onerror = () => setStatus("error");
  }, []);

  const dispatch = useCallback(
    (intent: Intent) => {
      setLastError(null);
      send({ type: "intent", intent });
    },
    [send],
  );

  const disconnect = useCallback(() => {
    send({ type: "leave" });
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("idle");
    setState(null);
    setPlayerId(null);
    setLastError(null);
  }, [send]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  return { status, playerId, state, dispatch, connect, disconnect, lastError };
}
