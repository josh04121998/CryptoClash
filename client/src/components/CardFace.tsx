import { CardTemplate } from "@cryptoclash/engine";
import { factionColor } from "../factionColor.js";
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
  size = "board",
  onClick,
}: CardFaceProps) {
  const showAttack = attack ?? template.attack;
  const showHealth = health ?? template.health;
  const damaged = maxHealth !== undefined && health !== undefined && health < maxHealth;
  const isCreature = template.type === "Creature";

  return (
    <button
      type="button"
      className={[
        "card-face",
        `card-face--${size}`,
        selected ? "card-face--selected" : "",
        dimmed ? "card-face--dimmed" : "",
        !affordable ? "card-face--unaffordable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: factionColor(template.faction) }}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="card-face__cost">{template.cost}</span>
      {template.rarity && (
        <span className="card-face__rarity" style={{ background: rarityColor(template.rarity) }} title={template.rarity} />
      )}
      <span className="card-face__name">{template.name}</span>
      {keywords && keywords.length > 0 && (
        <span className="card-face__keywords">{keywords.join(" · ")}</span>
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
