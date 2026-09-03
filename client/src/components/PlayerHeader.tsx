import { PlayerState } from "@cryptoclash/engine";

export interface PlayerHeaderProps {
  name: string;
  player: PlayerState;
  isActive: boolean;
  targetable?: boolean;
  onClick?: () => void;
}

export function PlayerHeader({ name, player, isActive, targetable = false, onClick }: PlayerHeaderProps) {
  return (
    <button
      type="button"
      className={["player-header", isActive ? "player-header--active" : "", targetable ? "player-header--targetable" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="player-header__name">{name}</span>
      <span className="player-header__hp">❤ {player.hp}</span>
      <span className="player-header__energy">
        ⚡ {player.energy}/{player.maxEnergy}
      </span>
      <span className="player-header__deck">Deck: {player.deck.length}</span>
    </button>
  );
}
