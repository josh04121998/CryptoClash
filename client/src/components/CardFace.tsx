import { CardTemplate } from "@cryptoclash/engine";
import { CSSProperties, MouseEvent, useEffect, useRef, useState } from "react";
import { cardArt } from "../cardArt.js";
import { conditionBandName, conditionVisualTier } from "../conditionGrade.js";
import { factionColor } from "../factionColor.js";
import { factionTicker } from "../factionTicker.js";
import { frameArt } from "../frameArt.js";
import { KEYWORD_TOOLTIPS } from "../keywordInfo.js";
import { rarityColor } from "../rarityColor.js";
import { StatIcon } from "./StatIcon.js";

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
  /** Cosmetic-only Condition/Floor Grade, 1-10 (collectibility.md Section 7) — never affects gameplay. Omitted where the caller has no specific instance in hand (e.g. a template browsed in isolation with no owned copy). */
  conditionGrade?: number;
  size?: "hand" | "board";
  /** This creature just attacked — a one-shot lunge toward the enemy row (BoardRow decides which physical direction that is). */
  attackDirection?: "up" | "down";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The card frame — real generated illustration (`cardArt.ts`) layered under
 * the real generated rarity-frame art (`frameArt.ts`, branding.md §9.6),
 * which has real alpha transparency baked in by
 * `tools/card-render/chroma-key-frames.mjs` (the source JPEGs don't — AI
 * image output has no alpha channel — see that script's doc comment for why
 * this is a plain `background-image` layer rather than a blend-mode trick).
 * Falls back to a CSS placeholder glow when a card has no real illustration
 * yet (most of the pool — art generation is a slow background task,
 * branding.md §9.5) or no rarity yet (tokens — `frameArt` falls back to the
 * Legendary frame shape, only Common..Legendary have real art).
 *
 * Hearthstone-style split, not one layout at every size: a battlefield
 * minion (`size="board"`) shows only portrait + cost/attack/health — no
 * name, no rules text, exactly how Hearthstone's own battlefield reads
 * (full text only ever appears in hand or on a hover-preview, never
 * permanently crammed onto a minion the size of a postage stamp). Every
 * other size ("hand" — also used by Collection/Crafting/DeckBuilder/Packs,
 * not just the match hand) renders the full card: name, keywords, rules
 * text, inside the frame art's own text window (measured empirically —
 * see the git history for the sampling script — art window ends ~59%
 * down, text window is ~61%-97%).
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
  conditionGrade,
  size = "board",
  attackDirection,
  onClick,
}: CardFaceProps) {
  const showAttack = attack ?? template.attack;
  const showHealth = health ?? template.health;
  const damaged = maxHealth !== undefined && health !== undefined && health < maxHealth;
  const isCreature = template.type === "Creature";
  const art = cardArt(template.id);
  const showFullFace = size !== "board";
  const frame = frameArt(template.rarity, !showFullFace);
  const conditionTier = conditionGrade !== undefined ? conditionVisualTier(conditionGrade) : null;
  // A real playtest flag: a board minion's Guard status was invisible at a glance (board size
  // shows no keyword text at all, per the deliberate Hearthstone-style split above) — you only
  // found out it was protecting you when trying to attack past it, and had no visual cue once
  // it died that the protection was gone. Hand size already shows "Guard" in the keyword line;
  // this badge is board-only.
  const showGuardBadge = !showFullFace && Boolean(keywords?.includes("Guard"));

  // A screen-reader user gets nothing meaningful from the visual card frame
  // (stat gems, faction ticker, rarity-colored border) on its own — this
  // composes the same info (name, cost, stats, keywords, rules text) into
  // one readable accessible name, overriding the button's default
  // name-from-content. Also set as a native `title` tooltip: a board
  // minion deliberately shows no name/text on its face (see doc comment
  // above), so a plain hover tooltip is the cheap fallback for "what does
  // this actually do" until a real hover-to-inspect popup exists.
  const accessibleLabel = [
    template.name,
    template.rarity,
    `cost ${template.cost}`,
    isCreature ? `${showAttack} attack, ${showHealth} health` : template.type,
    keywords && keywords.length > 0 ? keywords.join(", ") : undefined,
    template.text || undefined,
    foil ? "foil" : undefined,
    conditionGrade !== undefined ? `Condition: ${conditionBandName(conditionGrade)}` : undefined,
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
      title={showFullFace ? undefined : accessibleLabel}
      className={[
        "card-face",
        `card-face--${size}`,
        selected ? "card-face--selected" : "",
        dimmed ? "card-face--dimmed" : "",
        !affordable ? "card-face--unaffordable" : "",
        justHit ? "card-face--hit" : "",
        foil ? "card-face--foil" : "",
        conditionTier ? `card-face--condition-${conditionTier}` : "",
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
      <span
        className={["card-face__art", art ? "card-face__art--real" : "", showFullFace ? "card-face__art--fade" : ""]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
        style={art ? { backgroundImage: `url(${art})` } : undefined}
      />
      {frame && <span className="card-face__frame" aria-hidden="true" style={{ backgroundImage: `url(${frame})` }} />}
      {conditionTier && <span className={`card-face__condition card-face__condition--${conditionTier}`} aria-hidden="true" />}

      <span className="card-face__cost">
        <StatIcon kind="energy" />
        {template.cost}
      </span>
      <span className="card-face__ticker" title={template.faction}>
        {factionTicker(template.faction)}
      </span>

      {showFullFace && (
        <span className="card-face__body">
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
          <span className="card-face__footer">
            {template.type} · {template.faction.replace(/([A-Z])/g, " $1").trim().toUpperCase()}
          </span>
        </span>
      )}

      {isCreature && (
        <span className="card-face__stats">
          <span className="card-face__attack">
            <StatIcon kind="attack" />
            {showAttack}
          </span>
          {showGuardBadge && (
            <span className="card-face__guard-badge" title="Guard">
              <StatIcon kind="guard" />
            </span>
          )}
          <span className={`card-face__health ${damaged ? "card-face__health--damaged" : ""}`}>
            <StatIcon kind="health" />
            {showHealth}
          </span>
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
