import { MatchState, PlayerId } from "@cryptoclash/engine";
import { useEffect, useRef, useState } from "react";

const ANIMATION_MS = 420;

/**
 * Detects "a creature was just placed in this slot" by diffing board occupancy per slot against
 * the previous MatchState snapshot — empty/missing→occupied is a play, anything else (already
 * occupied, stayed empty, became empty again on death) is not. Same one-shot ref-diff shape as
 * useAttackAnimations.ts, deliberately — works uniformly for the local player, the remote
 * opponent, and the bot, since it reads engine state rather than the UI event that caused it.
 *
 * Returns the set of currently-"just played" `${playerId}-${slot}` keys — BoardRow/CardFace just
 * check membership for the landing-pop animation, no need to know *why*.
 */
export function useCardPlayAnimations(state: MatchState): Set<string> {
  const prevRef = useRef<Record<string, boolean>>({});
  // See useAttackAnimations.ts's identical guard — false until the first snapshot is taken, so a
  // fresh reconnect/page-refresh with an already-occupied board never animates on arrival.
  const primedRef = useRef(false);
  const [justPlayed, setJustPlayed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next: Record<string, boolean> = {};
    const played: string[] = [];
    (["A", "B"] as PlayerId[]).forEach((playerId) => {
      state.players[playerId].board.forEach((creature, slot) => {
        const key = `${playerId}-${slot}`;
        const occupied = creature !== null;
        next[key] = occupied;
        if (primedRef.current && occupied && !prevRef.current[key]) {
          played.push(key);
        }
      });
    });
    prevRef.current = next;
    primedRef.current = true;

    if (played.length > 0) {
      setJustPlayed((prev) => new Set([...prev, ...played]));
      const timer = setTimeout(() => {
        setJustPlayed((prev) => {
          const copy = new Set(prev);
          played.forEach((k) => copy.delete(k));
          return copy;
        });
      }, ANIMATION_MS);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log.length]);

  return justPlayed;
}
