import { BOARD_SIZE, BoardCreature, CARD_POOL, MatchState, PlayerId, getEffectiveAttack } from "@cryptoclash/engine";
import { CardFace } from "./CardFace.js";

export interface BoardRowProps {
  state: MatchState;
  playerId: PlayerId;
  /** Whose board this physically is, for drag-and-drop hit-testing — see MatchView's onCardDragEnd. */
  side: "own" | "enemy";
  selectedSlot?: number;
  targetable?: boolean;
  /** When set alongside `targetable`, only this specific slot renders the target ring — combat.ts's
   * Guard rule ("must be attacked first") means only the Guard's own slot is ever a legal attack
   * target while one's up, not every enemy creature. Undefined preserves the old
   * every-occupied-slot behavior, which is still correct for targeted spells/items (Guard is an
   * attack-only rule, never applied to effect targeting). */
  restrictTargetToSlot?: number;
  /** Highlights every *empty* slot as a valid drop target — a selected creature card needs an
   * empty slot, not an occupied one, so this is deliberately separate from `targetable` (which
   * only ever renders on occupied slots, for attack/friendly-effect targeting). Styled distinctly
   * from `targetable`'s red combat ring (see CardFace/BoardRow's own doc comments) — this is a
   * friendly placement affordance, not a hostile-target one. */
  targetableEmpty?: boolean;
  /** Keys from useAttackAnimations, `${playerId}-${slot}` — which creatures just attacked. */
  attackingSlots?: Set<string>;
  /** Which physical direction "toward the enemy" is for this row — MatchView renders the opponent's row above mine, so this differs per call site. */
  attackDirection?: "up" | "down";
  onSlotClick: (slot: number) => void;
  /** tutorial_v1 pulsing ring on a slot */
  spotlightSlot?: number;
  /** tutorial_v1 — spotlight any Guard on this row */
  spotlightGuard?: boolean;
}

export function allKeywords(creature: BoardCreature): string[] {
  return Array.from(new Set([...creature.keywords, ...creature.tempKeywords]));
}

export function BoardRow({
  state,
  playerId,
  side,
  selectedSlot,
  targetable = false,
  restrictTargetToSlot,
  targetableEmpty = false,
  attackingSlots,
  attackDirection,
  onSlotClick,
  spotlightSlot,
  spotlightGuard,
}: BoardRowProps) {
  const board = state.players[playerId].board;

  return (
    <div className="board-row">
      {Array.from({ length: BOARD_SIZE }, (_, slot) => {
        const creature = board[slot];
        if (!creature) {
          const spotEmpty = spotlightSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              aria-label={
                targetableEmpty ? `Place selected creature in board slot ${slot + 1}` : `Empty board slot ${slot + 1}`
              }
              data-drop-zone={side === "own" ? "own-slot" : "enemy-slot"}
              data-slot={slot}
              data-empty="true"
              className={[
                "board-slot",
                "board-slot--empty",
                spotEmpty ? "board-slot--spotlight" : "",
                targetableEmpty ? "board-slot--placeable" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSlotClick(slot)}
            />
          );
        }
        const template = CARD_POOL[creature.templateId];
        const isGuard = Boolean(creature.keywords.has("Guard") || creature.tempKeywords.has("Guard"));
        const spotOcc = spotlightSlot === slot || Boolean(spotlightGuard && isGuard);
        return (
          <div
            key={slot}
            data-drop-zone={side === "own" ? "own-slot" : "enemy-slot"}
            data-slot={slot}
            data-empty="false"
            className={["board-slot", spotOcc ? "board-slot--spotlight" : ""].filter(Boolean).join(" ")}
          >
            <CardFace
              template={template}
              attack={getEffectiveAttack(state, playerId, slot)}
              health={creature.health}
              maxHealth={creature.maxHealth}
              keywords={allKeywords(creature)}
              selected={selectedSlot === slot}
              dimmed={creature.hasAttackedThisTurn}
              attackDirection={attackingSlots?.has(`${playerId}-${slot}`) ? attackDirection : undefined}
              onClick={() => onSlotClick(slot)}
            />
            {targetable && (restrictTargetToSlot === undefined || restrictTargetToSlot === slot) && (
              <div className="board-slot__target-ring" />
            )}
          </div>
        );
      })}
    </div>
  );
}
