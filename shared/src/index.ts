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

export function serializeState(state: MatchState): NetworkMatchState {
  const mapPlayer = (player: PlayerState): NetworkPlayerState => ({
    ...player,
    board: player.board.map((creature) =>
      creature
        ? { ...creature, keywords: Array.from(creature.keywords), tempKeywords: Array.from(creature.tempKeywords) }
        : null,
    ),
  });
  const { rng, ...rest } = state;
  return { ...rest, players: { A: mapPlayer(state.players.A), B: mapPlayer(state.players.B) } };
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

export type ClientMessage = { type: "findMatch" } | { type: "intent"; intent: Intent } | { type: "leave" };

export type ServerMessage =
  | { type: "queued" }
  | { type: "matchFound"; playerId: PlayerId; state: NetworkMatchState }
  | { type: "state"; state: NetworkMatchState }
  | { type: "error"; message: string }
  | { type: "opponentLeft" };
