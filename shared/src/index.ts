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
  // Intentional exit (a "Leave" click) — ends the match for the opponent right
  // away, no reconnect grace period. Distinct from the socket simply closing.
  | { type: "leave" }
  // Presented on a fresh socket to resume a match that's still being held open
  // after an earlier *unexpected* disconnect (see matchRoom.ts's reconnect grace
  // period). `reconnectToken` (handed out in `matchFound`/`reconnected`) is the
  // primary way to prove "this is the same seat" — it works for anonymous play
  // too, since there's no other persistent identity there. `token` (the wallet
  // session JWT) is a fallback: if the reconnectToken was lost client-side
  // (e.g. a full page reload wiped in-memory state) but the same wallet-linked
  // account still has an active held room, that's accepted too.
  | { type: "reconnect"; reconnectToken?: string; token?: string };

export type ServerMessage =
  | { type: "queued" }
  // reconnectToken: a short-lived, per-seat, per-match secret — present only so
  // this exact socket (or a fresh one presenting it back via `reconnect`) can
  // resume this specific match after an unexpected disconnect.
  | { type: "matchFound"; playerId: PlayerId; state: NetworkMatchState; reconnectToken: string }
  | { type: "state"; state: NetworkMatchState }
  | { type: "error"; message: string }
  // Kept for wire backward-compatibility; the server no longer sends this. An
  // intentional leave or an expired reconnect grace period now both resolve
  // as a real forfeit — the normal `state` broadcast (with `winner` set)
  // already conveys "the match is over," so there's nothing this would add.
  | { type: "opponentLeft" }
  // Sent to the still-connected player the instant their opponent's socket
  // drops unexpectedly. The match is NOT over — `graceMs` is how long that
  // seat stays held open for a `reconnect` before it's forfeited to whoever's left.
  | { type: "opponentDisconnected"; graceMs: number }
  // Sent to the still-connected player once their opponent's held seat is
  // reoccupied within the grace period — the disconnect banner can clear.
  | { type: "opponentReconnected" }
  // Reply to a successful `reconnect` — same payload shape `matchFound` sends,
  // so the client can resume rendering exactly where the match left off.
  | { type: "reconnected"; playerId: PlayerId; state: NetworkMatchState }
  // Reply to a `reconnect` that didn't match any held room (unknown/expired
  // token, or the grace period already lapsed) — treat this as a dead match.
  | { type: "reconnectFailed" }
  // Sent once, right after a match concludes, only to a socket whose session
  // resolved to a real account (see matchRoom.ts) — anonymous/Play-vs-AI never get this.
  // Also re-sent on a successful `reconnect` if the reward already fired while
  // that player was disconnected, so a late reconnect doesn't miss the banner.
  | { type: "matchReward"; coinsEarned: number; balance: number };

/**
 * Telemetry (session 33). The event-name allowlist lives here, in the shared protocol
 * package, for the same reason ClientMessage/ServerMessage do: it's a wire contract both
 * sides have to agree on. The *server* is the authority — it re-checks every name against
 * this list and silently drops anything else (see telemetryRepo.ts and POST /api/telemetry);
 * the client imports it so that a typo is a compile error rather than an event that
 * silently vanishes in production.
 *
 * Deliberately no free text anywhere: no event carries user-entered strings, and no IP,
 * wallet address, user agent or referrer is ever stored. Identity is an internal account
 * uuid (which the server resolves from the bearer token itself — the client never sends
 * one) plus a random client-generated anon_id that buckets a browser, not a person.
 */
export const TELEMETRY_EVENT_NAMES = [
  "app_open",
  "landing_cta",
  "tutorial_offered",
  "tutorial_started",
  "tutorial_completed",
  "tutorial_skipped",
  "wallet_connect_started",
  "wallet_connected",
  "deck_saved",
  "match_started",
  "match_ended",
  "queue_waited",
  "bot_fallback_shown",
  "pack_opened",
  "craft_action",
  "daily_claimed",
  "screen_view",
  // Not a funnel step: a crash report. The client has no error tracking of its
  // own, so a render error that blanks the app (see client/src/ErrorBoundary.tsx)
  // or a server-reported crash would otherwise be completely invisible — nobody
  // would know it happened, least of all at launch when it matters most. Props
  // carry only `where` and a truncated error name/message, never a stack trace
  // or anything a user typed.
  "client_error",
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

const TELEMETRY_EVENT_NAME_SET: ReadonlySet<string> = new Set(TELEMETRY_EVENT_NAMES);

export function isTelemetryEventName(name: unknown): name is TelemetryEventName {
  return typeof name === "string" && TELEMETRY_EVENT_NAME_SET.has(name);
}

/** A flat bag of primitives only — never nested, never free text. */
export type TelemetryProps = Record<string, string | number | boolean>;

export interface TelemetryEvent {
  name: TelemetryEventName;
  /** Client clock, epoch ms. The server records its own `created_at` alongside it — clock skew is real. */
  ts: number;
  props?: TelemetryProps;
}

/** The POST /api/telemetry request body. `accountId` is never sent — the server resolves it from the optional bearer token. */
export interface TelemetryBatch {
  anonId: string;
  events: TelemetryEvent[];
}

/** Batch/prop caps. Enforced server-side (the client is never trusted); exported so the client batches to the same numbers. */
export const TELEMETRY_MAX_BATCH_SIZE = 50;
export const TELEMETRY_MAX_PROP_KEYS = 10;
export const TELEMETRY_MAX_PROP_STRING_LENGTH = 64;

/** 16–64 chars of [a-z0-9]. A `crypto.randomUUID()` with the dashes stripped is 32, comfortably inside that. */
export function isValidAnonId(anonId: unknown): anonId is string {
  return typeof anonId === "string" && /^[a-z0-9]{16,64}$/.test(anonId);
}
