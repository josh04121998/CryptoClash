import { CardTemplate } from "@cryptoclash/engine";
import { CSSProperties, MouseEvent, useEffect, useRef, useState } from "react";
import { factionColor } from "../factionColor.js";
import { factionTicker } from "../factionTicker.js";
import { KEYWORD_TOOLTIPS } from "../keywordInfo.js";
import { rarityColor } from "../rarityColor.js";

export interface CardFaceProps {
  template: CardTemplate;
  attack?: number;
  health?: number;
  maxHealth?: number;
  keywords?: string[];
  affordable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  /** Cosmetic-only shimmer (spec.md Section 14) — never affects gameplay stats or legality. */
  foil?: boolean;
  size?: "hand" | "board";
  /** This creature just attacked — a one-shot lunge toward the enemy row (BoardRow decides which physical direction that is). */
  attackDirection?: "up" | "down";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The card frame — a Hearthstone-style layout (rarity-colored border + gem, a
 * faction "ticker" badge standing in for a faction icon, a name plate with a
 * rarity gem straddling its top edge, an inset text box, hexagon/circle stat
 * gems) built entirely from CSS/SVG shapes since there's no art-asset pipeline
 * (branding.md Section 7 — card art is last on the roadmap, not started). The
 * "portrait" band has no illustration; it's a faction-tinted glow over the
 * brand's existing scanline/CRT texture (branding.md Section 4) standing in
 * for art the same way the landing page's skyline is CSS/SVG rather than an
 * image.
 *
 * Structural change only — every existing hook this hangs off of (hit-flash,
 * damage/heal popups, foil shimmer, keyword tooltips, lunge classes) is
 * untouched: they all key off `.card-face` itself (classes, the `::after`
 * hit-flash overlay, the foil dual-background trick) or absolutely-positioned
 * children, none of which care about the frame's internal structure.
 */
export function CardFace({
  template,
  attack,
  health,
  maxHealth,
  keywords,
  affordable = true,
  selected = false,
  dimmed = false,
  foil = false,
  size = "board",
  attackDirection,
  onClick,
}: CardFaceProps) {
  const showAttack = attack ?? template.attack;
  const showHealth = health ?? template.health;
  const damaged = maxHealth !== undefined && health !== undefined && health < maxHealth;
  const isCreature = template.type === "Creature";

  // A screen-reader user gets nothing meaningful from the visual card frame
  // (stat gems, faction ticker, rarity gem) on its own — this composes the
  // same info (name, cost, stats, keywords, rules text) into one readable
  // accessible name, overriding the button's default name-from-content.
  const accessibleLabel = [
    template.name,
    template.rarity,
    `cost ${template.cost}`,
    isCreature ? `${showAttack} attack, ${showHealth} health` : template.type,
    keywords && keywords.length > 0 ? keywords.join(", ") : undefined,
    template.text || undefined,
    foil ? "foil" : undefined,
    affordable === false ? "not enough energy" : undefined,
  ]
    .filter(Boolean)
    .join(". ");

  // "just hit" is a one-shot trigger, distinct from `damaged` above: it fires
  // only on the render where health *drops* from what it was last render,
  // not on every render while the creature happens to be below max health.
  // `popup` rides the same detection but also covers a *heal* (health rising) —
  // one mechanism, two colors, both one-shot pop-and-fade numbers.
  const [justHit, setJustHit] = useState(false);
  const [popup, setPopup] = useState<{ amount: number; heal: boolean; key: number } | null>(null);
  const prevHealthRef = useRef(health);
  useEffect(() => {
    const prev = prevHealthRef.current;
    if (prev !== undefined && health !== undefined && health !== prev) {
      const heal = health > prev;
      prevHealthRef.current = health;
      setPopup({ amount: Math.abs(health - prev), heal, key: Date.now() });
      const popupTimer = setTimeout(() => setPopup(null), 700);
      if (heal) return () => clearTimeout(popupTimer);
      setJustHit(true);
      const hitTimer = setTimeout(() => setJustHit(false), 450);
      return () => {
        clearTimeout(popupTimer);
        clearTimeout(hitTimer);
      };
    }
    prevHealthRef.current = health;
  }, [health]);

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      className={[
        "card-face",
        `card-face--${size}`,
        selected ? "card-face--selected" : "",
        dimmed ? "card-face--dimmed" : "",
        !affordable ? "card-face--unaffordable" : "",
        justHit ? "card-face--hit" : "",
        foil ? "card-face--foil" : "",
        attackDirection ? `card-face--lunge-${attackDirection}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      // Plain style props here would always win over CSS (inline style beats any
      // stylesheet rule regardless of specificity) — custom properties instead
      // let .card-face--foil's border-color: transparent still override the base
      // rarity-colored border.
      style={
        {
          "--faction-color": factionColor(template.faction),
          "--rarity-color": template.rarity ? rarityColor(template.rarity) : "var(--border-bright)",
        } as CSSProperties
      }
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="card-face__stripe" />

      <span className="card-face__portrait" aria-hidden="true">
        <span className="card-face__cost">{template.cost}</span>
        <span className="card-face__ticker" title={template.faction}>
          {factionTicker(template.faction)}
        </span>
      </span>

      <span className="card-face__name-plate">
        {template.rarity && <span className="card-face__rarity-gem" title={template.rarity} />}
        <span className="card-face__name">{template.name}</span>
      </span>

      <span className="card-face__textbox">
        {keywords && keywords.length > 0 && (
          <span className="card-face__keywords">
            {keywords.map((kw, i) => (
              <span key={kw} className="card-face__keyword" title={KEYWORD_TOOLTIPS[kw]}>
                {kw}
                {i < keywords.length - 1 ? " · " : ""}
              </span>
            ))}
          </span>
        )}
        <span className="card-face__text">{template.text}</span>
      </span>

      {isCreature && (
        <span className="card-face__stats">
          <span className="card-face__attack">{showAttack}</span>
          <span className={`card-face__health ${damaged ? "card-face__health--damaged" : ""}`}>{showHealth}</span>
        </span>
      )}
      {popup && (
        <span key={popup.key} className={`card-face__popup ${popup.heal ? "card-face__popup--heal" : "card-face__popup--damage"}`}>
          {popup.heal ? "+" : "-"}
          {popup.amount}
        </span>
      )}
    </button>
  );
}
