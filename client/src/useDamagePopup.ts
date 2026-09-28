import { useEffect, useRef, useState } from "react";

export interface DamagePopup {
  amount: number;
  heal: boolean;
  key: number;
}

const POPUP_LIFETIME_MS = 700;
const HIT_LIFETIME_MS = 450;
// A queue, not a single slot, capped at a small number — two near-simultaneous hits (a Rush
// attack landing right after a trade, say) used to have the second's `key: Date.now()` just
// replace the first's popup state outright, silently dropping one of the two numbers.
const MAX_CONCURRENT_POPUPS = 3;

/**
 * One-shot "just hit"/"just healed" feedback derived from watching a health value change across
 * renders, not from any explicit event — shared by CardFace (creature health) and PlayerHeader
 * (player hp), which used to each carry an identical copy of this same state machine. `justHit`
 * fires only on the render where the value *drops* from what it was last render, not on every
 * render while it happens to sit below max; `popups` rides the same detection but also covers a
 * *heal* (value rising).
 */
export function useDamagePopup(value: number | undefined) {
  const [justHit, setJustHit] = useState(false);
  const [popups, setPopups] = useState<DamagePopup[]>([]);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === undefined || value === undefined || value === prev) {
      prevRef.current = value;
      return;
    }
    const heal = value > prev;
    prevRef.current = value;
    const popup: DamagePopup = { amount: Math.abs(value - prev), heal, key: Date.now() + Math.random() };
    setPopups((current) => [...current, popup].slice(-MAX_CONCURRENT_POPUPS));
    const popupTimer = setTimeout(() => {
      setPopups((current) => current.filter((p) => p.key !== popup.key));
    }, POPUP_LIFETIME_MS);

    if (heal) return () => clearTimeout(popupTimer);

    setJustHit(true);
    const hitTimer = setTimeout(() => setJustHit(false), HIT_LIFETIME_MS);
    return () => {
      clearTimeout(popupTimer);
      clearTimeout(hitTimer);
    };
  }, [value]);

  return { justHit, popups };
}
