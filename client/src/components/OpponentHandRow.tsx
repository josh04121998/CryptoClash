/**
 * The opponent's hand, rendered face-down — count-only, matching what the
 * server now actually sends (server/src/matchRoom.ts, shared/src/index.ts's
 * per-viewer `serializeState`): the opponent's real card identities never
 * reach this client at all, so there's nothing here to accidentally render.
 * `count` is just `state.players[opponentId].hand.length`, which the network
 * payload always carries honestly even though the identities are redacted.
 */
export interface OpponentHandRowProps {
  count: number;
}

export function OpponentHandRow({ count }: OpponentHandRowProps) {
  if (count === 0) return null;
  return (
    <div className="hand-row hand-row--opponent" aria-label={`Opponent's hand: ${count} card${count === 1 ? "" : "s"}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card-face card-face--hand card-face--back" aria-hidden="true" />
      ))}
    </div>
  );
}
