import { CARD_POOL, PlayerState } from "@cryptoclash/engine";
import { CardFace } from "./CardFace.js";

export interface HandRowProps {
  player: PlayerState;
  selectedIndex?: number;
  interactive: boolean;
  onCardClick: (index: number) => void;
}

export function HandRow({ player, selectedIndex, interactive, onCardClick }: HandRowProps) {
  return (
    <div className="hand-row">
      {player.hand.map((templateId, index) => {
        const template = CARD_POOL[templateId];
        return (
          <CardFace
            key={`${templateId}-${index}`}
            template={template}
            keywords={template.keywords}
            size="hand"
            affordable={player.energy >= template.cost}
            selected={selectedIndex === index}
            onClick={interactive ? () => onCardClick(index) : undefined}
          />
        );
      })}
    </div>
  );
}
