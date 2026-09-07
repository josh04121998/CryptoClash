import { PlayerState } from "@cryptoclash/engine";
import { useEffect, useRef, useState } from "react";

export interface PlayerHeaderProps {
  name: string;
  player: PlayerState;
  isActive: boolean;
  targetable?: boolean;
  onClick?: () => void;
}

export function PlayerHeader({ name, player, isActive, targetable = false, onClick }: PlayerHeaderProps) {
  // Same one-shot "just took damage" pattern as CardFace: diff this render's
  // HP against last render's to detect a hit, rather than reacting to every
  // re-render while HP happens to be below max.
  const [justHit, setJustHit] = useState(false);
  const prevHpRef = useRef(player.hp);
  useEffect(() => {
    if (player.hp < prevHpRef.current) {
      setJustHit(true);
      const timer = setTimeout(() => setJustHit(false), 450);
      prevHpRef.current = player.hp;
      return () => clearTimeout(timer);
    }
    prevHpRef.current = player.hp;
  }, [player.hp]);

  return (
    <button
      type="button"
      className={[
        "player-header",
        isActive ? "player-header--active" : "",
        targetable ? "player-header--targetable" : "",
        justHit ? "player-header--hit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="player-header__name">{name}</span>
      <span className={`player-header__hp ${justHit ? "player-header__hp--hit" : ""}`}>❤ {player.hp}</span>
      <span className="player-header__energy">
        ⚡ {player.energy}/{player.maxEnergy}
      </span>
      <span className="player-header__deck">Deck: {player.deck.length}</span>
    </button>
  );
}
