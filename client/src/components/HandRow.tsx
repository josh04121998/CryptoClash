import { CARD_POOL, PlayerState } from "@cryptoclash/engine";
import { CardFace } from "./CardFace.js";

export interface HandRowProps {
  player: PlayerState;
  selectedIndex?: number;
  interactive: boolean;
  onCardClick: (index: number) => void;
  spotlightTemplateId?: string;
}

export function HandRow({ player, selectedIndex, interactive, onCardClick, spotlightTemplateId }: HandRowProps) {
  return (
    <div className="hand-row">
      {player.hand.map((templateId, index) => {
        const template = CARD_POOL[templateId];
        const spot = spotlightTemplateId === templateId;
        return (
          <div key={`${templateId}-${index}`} className={spot ? "hand-card--spotlight" : undefined}>
            <CardFace
              template={template}
              keywords={template.keywords}
              size="hand"
              affordable={player.energy >= template.cost}
              selected={selectedIndex === index}
              onClick={interactive ? () => onCardClick(index) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
