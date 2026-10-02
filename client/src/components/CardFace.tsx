import { CardTemplate } from "@cryptoclash/engine";
import { CSSProperties, MouseEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cardArt, fullCardArt } from "../cardArt.js";
import { conditionBandName, conditionVisualTier } from "../conditionGrade.js";
import { EDITION_LABEL, EDITION_NAME, EditionType, isSpecialEdition } from "../editionType.js";
import { useDamagePopup } from "../useDamagePopup.js";
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
  /** Cosmetic-only print/edition (collectibility.md §4/§8) — never affects gameplay stats or legality. Omitted (or "standard") where the caller has no specific instance, or the instance is a plain Standard print, same as every card outside a Founders Set. */
  editionType?: EditionType;
  size?: "hand" | "board";
  /** This creature just attacked — a one-shot lunge toward the enemy row (BoardRow decides which physical direction that is). */
  attackDirection?: "up" | "down";
  /** This creature was just placed on the board this render pass — a one-shot landing "pop", purely cosmetic. */
  justPlayed?: boolean;
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
 * A Full Art/Ultra/Secret instance (`editionType`, Founders Set only) swaps in
 * `fullCardArt()`'s illustration and drops the frame layer entirely, mirroring
 * `tools/card-render/render-card.mjs`'s own mint-time compositor exactly: the frame PNG's
 * opaque-except-a-cutout design is what makes Standard art read as "windowed" at all, so a
 * bleeding-edge-to-edge illustration with no frame overlay is the whole of what "Full Art" means
 * here — no separate layout. Falls back to the plain Standard look (art + frame) when the
 * instance's template has no Full Art illustration generated yet, same "don't show a broken/empty
 * state" posture as the ordinary no-art-yet placeholder.
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
  editionType,
  size = "board",
  attackDirection,
  justPlayed = false,
  onClick,
}: CardFaceProps) {
  const showAttack = attack ?? template.attack;
  const showHealth = health ?? template.health;
  const damaged = maxHealth !== undefined && health !== undefined && health < maxHealth;
  const isCreature = template.type === "Creature";
  const fullArt = isSpecialEdition(editionType) ? fullCardArt(template.id) : undefined;
  const art = fullArt ?? cardArt(template.id);
  const showFullFace = size !== "board";
  // Only actually drop the frame when a real Full Art illustration is in play — a special-edition
  // instance whose template has no Full Art asset yet still gets the ordinary framed Standard look
  // rather than bleeding a Standard illustration edge-to-edge, which the frame art was never
  // designed to sit under.
  const frame = fullArt ? undefined : frameArt(template.rarity, !showFullFace);
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
    isSpecialEdition(editionType) ? EDITION_NAME[editionType] : undefined,
    affordable === false ? "not enough energy" : undefined,
  ]
    .filter(Boolean)
    .join(". ");

  const { justHit, popups } = useDamagePopup(health);

  // Board-only hover/focus preview (see the badge/tooltip render below). Rendered through a
  // portal into document.body, not as a plain nested child: `.card-face` is `overflow: hidden`
  // (clips the art to its rounded corners) *and* every `.card-face:hover` gets a `translateY`
  // lift, which makes the button itself the containing block for any `position: fixed`
  // descendant (a CSS transform on an ancestor does that) — so a naive nested `fixed` tooltip
  // still ends up clipped/mispositioned relative to the card instead of the viewport. The portal
  // sidesteps both without touching either the widely-shared base card styling or the hover-lift
  // effect. Only wired up for board size — hand-size cards already show everything inline.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tipAnchor, setTipAnchor] = useState<{ top: number; left: number } | null>(null);
  const showTip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setTipAnchor({ top: rect.top, left: rect.left + rect.width / 2 });
  };
  const hideTip = () => setTipAnchor(null);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={accessibleLabel}
      title={showFullFace ? undefined : accessibleLabel}
      onMouseEnter={!showFullFace ? showTip : undefined}
      onMouseLeave={!showFullFace ? hideTip : undefined}
      onFocus={!showFullFace ? showTip : undefined}
      onBlur={!showFullFace ? hideTip : undefined}
      className={[
        "card-face",
        `card-face--${size}`,
        selected ? "card-face--selected" : "",
        dimmed ? "card-face--dimmed" : "",
        !affordable ? "card-face--unaffordable" : "",
        justHit ? "card-face--hit" : "",
        foil ? "card-face--foil" : "",
        fullArt ? "card-face--full-art" : "",
        conditionTier ? `card-face--condition-${conditionTier}` : "",
        attackDirection ? `card-face--lunge-${attackDirection}` : "",
        justPlayed ? "card-face--just-played" : "",
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
      {fullArt && isSpecialEdition(editionType) && (
        <span className="card-face__edition-badge" aria-hidden="true">
          {EDITION_LABEL[editionType]}
        </span>
      )}

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
      {/* Board minions show no name/text by design (see the doc comment above) — the only way to
          see what one does used to be tapping it (MatchView's tap-to-inspect fallback), with no
          visual cue that tapping does anything. This badge + hover-preview make that discoverable
          without disturbing the clean battlefield look: the badge is a small always-visible hint,
          the preview itself only reveals on real `:hover`/keyboard focus (CSS-only — no JS touch
          detection needed, since touch devices simply never trigger `:hover` and keep using the
          existing tap-to-inspect overlay instead). */}
      {!showFullFace && (
        <span className="card-face__info-badge" aria-hidden="true">
          i
        </span>
      )}
      {!showFullFace &&
        tipAnchor &&
        createPortal(
          <span className="card-face__hover-tip" role="tooltip" style={{ top: tipAnchor.top, left: tipAnchor.left }}>
            <span className="card-face__hover-tip-name">{template.name}</span>
            {keywords && keywords.length > 0 && (
              <span className="card-face__hover-tip-keywords">
                {keywords.map((kw) => (
                  <span key={kw} className="card-face__hover-tip-keyword">
                    <strong>{kw}</strong>
                    {KEYWORD_TOOLTIPS[kw] ? `: ${KEYWORD_TOOLTIPS[kw]}` : ""}
                  </span>
                ))}
              </span>
            )}
            {template.text && <span className="card-face__hover-tip-text">{template.text}</span>}
          </span>,
          document.body,
        )}
      {popups.map((popup, i) => (
        <span
          key={popup.key}
          className={`card-face__popup ${popup.heal ? "card-face__popup--heal" : "card-face__popup--damage"}`}
          style={{ "--popup-offset": `${(i - (popups.length - 1) / 2) * 20}px` } as CSSProperties}
        >
          {popup.heal ? "+" : "-"}
          {popup.amount}
        </span>
      ))}
    </button>
  );
}
