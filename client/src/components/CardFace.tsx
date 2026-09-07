import { CardTemplate } from "@cryptoclash/engine";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { factionColor } from "../factionColor.js";
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
  onClick?: () => void;
}

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
  onClick,
}: CardFaceProps) {
  const showAttack = attack ?? template.attack;
  const showHealth = health ?? template.health;
  const damaged = maxHealth !== undefined && health !== undefined && health < maxHealth;
  const isCreature = template.type === "Creature";

  // "just hit" is a one-shot trigger, distinct from `damaged` above: it fires
  // only on the render where health *drops* from what it was last render,
  // not on every render while the creature happens to be below max health.
  const [justHit, setJustHit] = useState(false);
  const prevHealthRef = useRef(health);
  useEffect(() => {
    const prev = prevHealthRef.current;
    if (prev !== undefined && health !== undefined && health < prev) {
      setJustHit(true);
      const timer = setTimeout(() => setJustHit(false), 450);
      prevHealthRef.current = health;
      return () => clearTimeout(timer);
    }
    prevHealthRef.current = health;
  }, [health]);

  return (
    <button
      type="button"
      className={[
        "card-face",
        `card-face--${size}`,
        selected ? "card-face--selected" : "",
        dimmed ? "card-face--dimmed" : "",
        !affordable ? "card-face--unaffordable" : "",
        justHit ? "card-face--hit" : "",
        foil ? "card-face--foil" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      // A plain `borderColor` here would always win over CSS (inline style beats any
      // stylesheet rule regardless of specificity) — setting a custom property instead
      // lets .card-face--foil's border-color: transparent actually override it.
      style={{ "--faction-color": factionColor(template.faction) } as CSSProperties}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="card-face__cost">{template.cost}</span>
      {template.rarity && (
        <span className="card-face__rarity" style={{ background: rarityColor(template.rarity) }} title={template.rarity} />
      )}
      <span className="card-face__name">{template.name}</span>
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
      {isCreature && (
        <span className="card-face__stats">
          <span className="card-face__attack">{showAttack}</span>
          <span className={`card-face__health ${damaged ? "card-face__health--damaged" : ""}`}>{showHealth}</span>
        </span>
      )}
    </button>
  );
}
