import { MatchState, PlayerId } from "@cryptoclash/engine";
import { useEffect, useRef, useState } from "react";

const ANIMATION_MS = 350;

/**
 * Detects "this creature just attacked" by diffing `hasAttackedThisTurn`
 * per board slot against the previous MatchState snapshot — false→true is
 * an attack, anything else (already true, still false, slot became empty)
 * is not. Works uniformly for the local player, the remote opponent, and
 * the bot, since it reads engine state rather than the intent that caused
 * it — no need to know "who dispatched this" the way a click-triggered
 * animation would. Same one-shot ref-diff shape as useMatchSounds.ts.
 *
 * Returns the set of currently-animating `${playerId}-${slot}` keys —
 * BoardRow/CardFace just check membership, no need to know *why*.
 *
 * Depends on `state.log.length`, not `state` itself — see useMatchSounds.ts's
 * comment on the same issue: `useMatch.ts` (Play vs AI) mutates its
 * MatchState in place and never hands back a new object reference, so an
 * effect keyed on the whole object would only ever run once, on mount. Every
 * attack pushes at least one log line (combat.ts), so log length is a
 * reliable proxy for "something happened, worth re-scanning the board."
 */
export function useAttackAnimations(state: MatchState): Set<string> {
  const prevRef = useRef<Record<string, boolean>>({});
  const [attacking, setAttacking] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next: Record<string, boolean> = {};
    const justAttacked: string[] = [];
    (["A", "B"] as PlayerId[]).forEach((playerId) => {
      state.players[playerId].board.forEach((creature, slot) => {
        if (!creature) return;
        const key = `${playerId}-${slot}`;
        next[key] = creature.hasAttackedThisTurn;
        if (creature.hasAttackedThisTurn && prevRef.current[key] === false) {
          justAttacked.push(key);
        }
      });
    });
    prevRef.current = next;

    if (justAttacked.length > 0) {
      setAttacking((prev) => new Set([...prev, ...justAttacked]));
      const timer = setTimeout(() => {
        setAttacking((prev) => {
          const copy = new Set(prev);
          justAttacked.forEach((k) => copy.delete(k));
          return copy;
        });
      }, ANIMATION_MS);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log.length]);

  return attacking;
}
