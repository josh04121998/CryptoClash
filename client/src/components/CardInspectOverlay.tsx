import { CARD_POOL, MatchState, PlayerId, getEffectiveAttack } from "@cryptoclash/engine";
import { allKeywords } from "./BoardRow.js";
import { CardFace } from "./CardFace.js";

export interface CardInspectOverlayProps {
  state: MatchState;
  playerId: PlayerId;
  slot: number;
  onClose: () => void;
}

/**
 * A tap-to-inspect popup for board minions — battlefield cards deliberately
 * show no name/rules text (CardFace.tsx's Hearthstone-style split), so this
 * is how a player actually reads what one does. Reuses the exact same
 * "hand" full-detail CardFace rendering, fed the creature's live stats
 * (effective attack, current/max health, keywords), so what you see here
 * always matches the board exactly — never a separate description that can
 * drift from the real game state.
 *
 * Tapping is the trigger, not hover: hover doesn't exist on a touch device
 * at all, and this game is played on both. Both the backdrop and the card
 * itself dismiss on click — there's no separate close button to hunt for.
 */
export function CardInspectOverlay({ state, playerId, slot, onClose }: CardInspectOverlayProps) {
  const creature = state.players[playerId].board[slot];
  if (!creature) return null;
  const template = CARD_POOL[creature.templateId];

  return (
    <div className="card-inspect-backdrop" onClick={onClose} role="button" tabIndex={0} aria-label="Close card detail">
      <div className="card-inspect-card">
        {/* Passing onClick here matters beyond wiring up "tap the card to close" —
            CardFace renders as `disabled={!onClick}`, and a disabled <button> never
            dispatches (or bubbles) a click event in Chrome at all. Without this, every
            click landing on the visible card (i.e. almost the whole overlay) would
            silently do nothing, only a click on the sliver of bare backdrop around it
            would ever reach this div's own onClick. */}
        <CardFace
          template={template}
          attack={getEffectiveAttack(state, playerId, slot)}
          health={creature.health}
          maxHealth={creature.maxHealth}
          keywords={allKeywords(creature)}
          size="hand"
          onClick={onClose}
        />
      </div>
      <p className="card-inspect-hint">Tap to close</p>
    </div>
  );
}
