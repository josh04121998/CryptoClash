import { PlayerState } from "@cryptoclash/engine";
import { CSSProperties } from "react";
import { useDamagePopup } from "../useDamagePopup.js";

export interface PlayerHeaderProps {
  name: string;
  player: PlayerState;
  isActive: boolean;
  targetable?: boolean;
  onClick?: () => void;
  spotlightEnergy?: boolean;
  spotlightPortrait?: boolean;
  /** This player is one unblocked attack away from losing right now — MatchView only ever computes
   * this for the opponent's own header. See MatchView's lethalAvailable doc comment. */
  lethal?: boolean;
  /** Set on the opponent's header only — lets a dragged card be dropped on this portrait. See MatchView's onCardDragEnd. */
  isDropZone?: boolean;
}

export function PlayerHeader({
  name,
  player,
  isActive,
  targetable = false,
  onClick,
  spotlightEnergy,
  spotlightPortrait,
  lethal = false,
  isDropZone = false,
}: PlayerHeaderProps) {
  const { justHit, popups } = useDamagePopup(player.hp);

  const accessibleLabel = [
    name,
    `${player.hp} HP`,
    `${player.energy} of ${player.maxEnergy} Energy`,
    `${player.deck.length} cards left in deck`,
    player.secrets.length > 0
      ? `${player.secrets.length} Secret${player.secrets.length > 1 ? "s" : ""} armed`
      : undefined,
    isActive ? "active turn" : undefined,
    lethal ? "lethal — attacking now can win the game" : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      data-drop-zone={isDropZone ? "enemy-portrait" : undefined}
      className={[
        "player-header",
        isActive ? "player-header--active" : "",
        targetable ? "player-header--targetable" : "",
        justHit ? "player-header--hit" : "",
        spotlightPortrait ? "player-header--spotlight" : "",
        lethal ? "player-header--lethal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="player-header__name">{name}</span>
      {lethal && (
        <span className="player-header__lethal-badge" aria-hidden="true">
          Lethal
        </span>
      )}
      <span className={`player-header__hp ${justHit ? "player-header__hp--hit" : ""}`}>♥ {player.hp}</span>
      <span
        className={
          spotlightEnergy ? "player-header__energy player-header__energy--spotlight" : "player-header__energy"
        }
      >
        ⚡ {player.energy}/{player.maxEnergy}
      </span>
      <span className="player-header__deck">Deck: {player.deck.length}</span>
      {player.secrets.length > 0 && (
        <span
          className="player-header__secrets"
          title={`${player.secrets.length} Secret${player.secrets.length > 1 ? "s" : ""} armed`}
        >
          🔒 {player.secrets.length}
        </span>
      )}
      {popups.map((popup, i) => (
        <span
          key={popup.key}
          className={`player-header__popup ${popup.heal ? "player-header__popup--heal" : "player-header__popup--damage"}`}
          style={{ "--popup-offset": `${(i - (popups.length - 1) / 2) * 26}px` } as CSSProperties}
        >
          {popup.heal ? "+" : "-"}
          {popup.amount}
        </span>
      ))}
    </button>
  );
}
