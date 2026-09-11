import { CARD_POOL, PlayerState } from "@cryptoclash/engine";
import { useRef, useState } from "react";
import { CardFace } from "./CardFace.js";

export interface HandRowProps {
  player: PlayerState;
  selectedIndex?: number;
  interactive: boolean;
  onCardTap: (index: number) => void;
  onCardDragStart: (index: number) => void;
  onCardDragEnd: (index: number, clientX: number, clientY: number) => void;
  spotlightTemplateId?: string;
}

const DRAG_THRESHOLD_PX = 8;

type DragState = { index: number; pointerId: number; dx: number; dy: number; moved: boolean };

/**
 * Hand cards support two gestures: a tap (select/preview — MatchView decides what
 * that means per card type) and a drag (pick the card up and drop it on a board
 * slot/portrait to commit). Both read the same underlying pointer stream — a real
 * "click" is indistinguishable from "pointerdown+pointerup with no movement" until
 * you've measured the movement, so this tracks raw pointer events itself rather
 * than relying on the button's native onClick, and only calls onCardTap once it
 * knows the gesture stayed under the drag threshold.
 *
 * All the actual game-dispatching side effects (onCardTap/onCardDragStart/onCardDragEnd)
 * are called directly in the event handler bodies, never from inside a setState updater
 * function — React (in StrictMode, which this app runs under in dev) may invoke an
 * updater function twice to check for side effects, which would otherwise fire a real
 * playCard dispatch twice per gesture. `dragRef` is the logic source of truth (always
 * current, safe to read/write synchronously); `drag` state exists only to trigger a
 * re-render for the visual drag-follow transform.
 */
export function HandRow({
  player,
  selectedIndex,
  interactive,
  onCardTap,
  onCardDragStart,
  onCardDragEnd,
  spotlightTemplateId,
}: HandRowProps) {
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // See HandRow's doc comment above — swallows the native "click" that follows a
  // pointer-driven tap/drag-end so onCardTap doesn't also fire from it.
  const suppressNextClickRef = useRef(false);

  function handlePointerDown(index: number, e: React.PointerEvent) {
    if (!interactive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const next: DragState = { index, pointerId: e.pointerId, dx: 0, dy: 0, moved: false };
    dragRef.current = next;
    setDrag(next);
  }

  function handlePointerMove(index: number, e: React.PointerEvent) {
    const prev = dragRef.current;
    if (!prev || prev.index !== index || prev.pointerId !== e.pointerId) return;
    const dx = e.movementX !== undefined ? prev.dx + e.movementX : prev.dx;
    const dy = e.movementY !== undefined ? prev.dy + e.movementY : prev.dy;
    const justCrossedThreshold = !prev.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX;
    const next: DragState = { ...prev, dx, dy, moved: prev.moved || justCrossedThreshold };
    dragRef.current = next;
    setDrag(next);
    if (justCrossedThreshold) onCardDragStart(index);
  }

  function handlePointerUp(index: number, e: React.PointerEvent) {
    const prev = dragRef.current;
    if (!prev || prev.index !== index || prev.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    suppressNextClickRef.current = true;
    if (prev.moved) {
      onCardDragEnd(index, e.clientX, e.clientY);
    } else {
      onCardTap(index);
    }
  }

  function handlePointerCancel(index: number, e: React.PointerEvent) {
    const prev = dragRef.current;
    if (prev && prev.index === index && prev.pointerId === e.pointerId) {
      dragRef.current = null;
      setDrag(null);
    }
  }

  return (
    <div className="hand-row">
      {player.hand.map((templateId, index) => {
        const template = CARD_POOL[templateId];
        const spot = spotlightTemplateId === templateId;
        const isDragging = drag?.index === index && drag.moved;
        return (
          <div
            key={`${templateId}-${index}`}
            className={[spot ? "hand-card--spotlight" : "", isDragging ? "hand-card--dragging" : ""]
              .filter(Boolean)
              .join(" ")}
            style={isDragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.1)` } : undefined}
            onPointerDown={(e) => handlePointerDown(index, e)}
            onPointerMove={(e) => handlePointerMove(index, e)}
            onPointerUp={(e) => handlePointerUp(index, e)}
            onPointerCancel={(e) => handlePointerCancel(index, e)}
          >
            <CardFace
              template={template}
              keywords={template.keywords}
              size="hand"
              affordable={player.energy >= template.cost}
              selected={selectedIndex === index}
              // Keyboard activation (Enter/Space on the focused button) never goes through
              // pointerdown/up, so it still needs this path — but a pointer-driven click just
              // handled by onPointerUp above must not also fire it. See suppressNextClickRef.
              onClick={
                interactive
                  ? () => {
                      if (suppressNextClickRef.current) {
                        suppressNextClickRef.current = false;
                        return;
                      }
                      onCardTap(index);
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}
