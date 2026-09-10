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
  // False until the first snapshot has been taken — guards against animating creatures that are
  // already mid-attack-flag the moment we start observing (a fresh reconnect/page-refresh state),
  // since we never saw their real "before" value.
  const primedRef = useRef(false);
  const [attacking, setAttacking] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next: Record<string, boolean> = {};
    const justAttacked: string[] = [];
    (["A", "B"] as PlayerId[]).forEach((playerId) => {
      state.players[playerId].board.forEach((creature, slot) => {
        if (!creature) return;
        const key = `${playerId}-${slot}`;
        next[key] = creature.hasAttackedThisTurn;
        // `!== true` (not `=== false`) so a creature that didn't exist in the previous snapshot
        // at all still counts as "just attacked" — e.g. Puppy Swarm summoning tokens and Pack
        // Rush granting them Rush in the same bot turn lets a brand-new creature attack before
        // this hook ever recorded a `false` baseline for its slot; `=== false` would miss it and
        // the attack wouldn't visibly resolve (no lunge) even though the damage landed for real.
        if (primedRef.current && creature.hasAttackedThisTurn && prevRef.current[key] !== true) {
          justAttacked.push(key);
        }
      });
    });
    prevRef.current = next;
    primedRef.current = true;

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
