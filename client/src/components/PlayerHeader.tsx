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
  // re-render while HP happens to be below max. Also covers a heal (HP rising).
  const [justHit, setJustHit] = useState(false);
  const [popup, setPopup] = useState<{ amount: number; heal: boolean; key: number } | null>(null);
  const prevHpRef = useRef(player.hp);
  useEffect(() => {
    const prev = prevHpRef.current;
    if (player.hp !== prev) {
      const heal = player.hp > prev;
      prevHpRef.current = player.hp;
      setPopup({ amount: Math.abs(player.hp - prev), heal, key: Date.now() });
      const popupTimer = setTimeout(() => setPopup(null), 700);
      if (heal) return () => clearTimeout(popupTimer);
      setJustHit(true);
      const hitTimer = setTimeout(() => setJustHit(false), 450);
      return () => {
        clearTimeout(popupTimer);
        clearTimeout(hitTimer);
      };
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
      {popup && (
        <span key={popup.key} className={`player-header__popup ${popup.heal ? "player-header__popup--heal" : "player-header__popup--damage"}`}>
          {popup.heal ? "+" : "-"}
          {popup.amount}
        </span>
      )}
    </button>
  );
}
