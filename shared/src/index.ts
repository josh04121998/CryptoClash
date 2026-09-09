import { BoardCreature, Intent, Keyword, MatchState, PlayerId, PlayerState } from "@cryptoclash/engine";

/**
 * MatchState carries a `rng` function and `Set`-typed keyword fields, neither
 * of which survive JSON.stringify. These types + (de)serializers are the one
 * place that boundary is crossed, so both client and server agree on it.
 */
export interface NetworkBoardCreature extends Omit<BoardCreature, "keywords" | "tempKeywords"> {
  keywords: Keyword[];
  tempKeywords: Keyword[];
}

export interface NetworkPlayerState extends Omit<PlayerState, "board"> {
  board: (NetworkBoardCreature | null)[];
}

export type NetworkMatchState = Omit<MatchState, "players" | "rng"> & {
  players: Record<PlayerId, NetworkPlayerState>;
};

/**
 * Placeholder template id substituted into a redacted zone (an opponent's
 * hand, deck order, or armed Secrets — see `serializeState` below). Never a
 * real `CARD_POOL` key, so any code that forgets to special-case it (e.g. a
 * naive `CARD_POOL[id]` lookup) fails safe with an undefined-template error
 * rather than silently rendering/leaking real card data.
 */
export const HIDDEN_CARD_ID = "__hidden__";

function redactZone(zone: string[]): string[] {
  return zone.map(() => HIDDEN_CARD_ID);
}

/**
 * Per-viewer serialization: `viewerId` is whichever player the resulting
 * payload is about to be sent to. That player's own hand/deck/secrets ride
 * along in full (needed to actually play the game); the *other* player's
 * hand, deck order, and armed Secrets are replaced with same-length arrays
 * of `HIDDEN_CARD_ID` — real counts (so e.g. PlayerHeader's "🔒 N" Secrets
 * badge and a "Deck: N" readout still work), never real identities. Board
 * state is always public (both players can already see it) and isn't
 * touched. Previously this sent one identical, fully-unredacted payload to
 * both sockets — a real information leak relative to the game's own design
 * intent (a Secret is supposed to be a surprise; an opponent's hand isn't
 * meant to be readable at all) — see card-schema.md Section 8.2.
 */
export function serializeState(state: MatchState, viewerId: PlayerId): NetworkMatchState {
  const mapPlayer = (player: PlayerState, isViewer: boolean): NetworkPlayerState => ({
    ...player,
    hand: isViewer ? player.hand : redactZone(player.hand),
    deck: isViewer ? player.deck : redactZone(player.deck),
    secrets: isViewer ? player.secrets : redactZone(player.secrets),
    board: player.board.map((creature) =>
      creature
        ? { ...creature, keywords: Array.from(creature.keywords), tempKeywords: Array.from(creature.tempKeywords) }
        : null,
    ),
  });
  const { rng, ...rest } = state;
  return {
    ...rest,
    players: {
      A: mapPlayer(state.players.A, viewerId === "A"),
      B: mapPlayer(state.players.B, viewerId === "B"),
    },
  };
}

export function deserializeState(net: NetworkMatchState): MatchState {
  const mapPlayer = (player: NetworkPlayerState): PlayerState => ({
    ...player,
    board: player.board.map((creature) =>
      creature
        ? { ...creature, keywords: new Set(creature.keywords), tempKeywords: new Set(creature.tempKeywords) }
        : null,
    ),
  });
  return {
    ...net,
    players: { A: mapPlayer(net.players.A), B: mapPlayer(net.players.B) },
    // A network-driven MatchState never calls createMatch/shuffle client-side;
    // this stub only exists to satisfy the type.
    rng: () => Math.random(),
  };
}

export type ClientMessage =
  // `cards` is the resolved 30-card list (a starter deck's cards, or a saved
  // custom deck's cards) — the server no longer needs to know deck ids, just
  // re-validates whatever list it's handed (see engine's validateDeck) and
  // falls back to a default deck if it's missing or illegal.
  // `token` is the wallet-connect session token (useWallet.ts), sent so the
  // server can attribute a match's Coins reward to a real account — omitted
  // entirely for anonymous play, which still works exactly as before.
  | { type: "findMatch"; cards?: string[]; token?: string }
  | { type: "intent"; intent: Intent }
  | { type: "leave" };

export type ServerMessage =
  | { type: "queued" }
  | { type: "matchFound"; playerId: PlayerId; state: NetworkMatchState }
  | { type: "state"; state: NetworkMatchState }
  | { type: "error"; message: string }
  | { type: "opponentLeft" }
  // Sent once, right after a match concludes, only to a socket whose session
  // resolved to a real account (see matchRoom.ts) — anonymous/Play-vs-AI never get this.
  | { type: "matchReward"; coinsEarned: number; balance: number };
