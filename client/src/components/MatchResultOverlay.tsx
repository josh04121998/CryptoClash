import { PlayerId } from "@cryptoclash/engine";
import { useMemo } from "react";

export interface MatchResultOverlayProps {
  winner: PlayerId | "Draw";
  myPlayerId: PlayerId;
  onDismiss: () => void;
}

interface Strip {
  left: number;
  delay: number;
  duration: number;
  rotate: number;
  color: string;
}

const STRIP_COLORS = ["#f2b705", "#00e28a", "#35c7ff", "#dfeee7"];

function makeStrips(count: number): Strip[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.4,
    rotate: Math.random() * 360,
    color: STRIP_COLORS[Math.floor(Math.random() * STRIP_COLORS.length)],
  }));
}

/**
 * A blocking-but-dismissible celebration moment on match end — "ticker tape
 * parade" confetti (thin falling strips, not round dots) for a win, since
 * that's a literal real Wall Street victory tradition and ties directly into
 * the "the floor is the battlefield" identity (branding.md). No confetti on
 * a loss — celebrating that would read as mocking the player.
 */
export function MatchResultOverlay({ winner, myPlayerId, onDismiss }: MatchResultOverlayProps) {
  const outcome: "win" | "loss" | "draw" = winner === "Draw" ? "draw" : winner === myPlayerId ? "win" : "loss";
  const strips = useMemo(() => (outcome !== "loss" ? makeStrips(outcome === "win" ? 60 : 30) : []), [outcome]);

  const title = outcome === "win" ? "YOU WIN" : outcome === "loss" ? "YOU LOSE" : "DRAW";

  return (
    <div className="match-result__backdrop" onClick={onDismiss}>
      {strips.map((s, i) => (
        <span
          key={i}
          className="match-result__strip"
          style={{
            left: `${s.left}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            backgroundColor: s.color,
            transform: `rotate(${s.rotate}deg)`,
          }}
        />
      ))}
      <div className={`match-result__card match-result__card--${outcome}`} onClick={(e) => e.stopPropagation()}>
        <span className="match-result__title">{title}</span>
        <button type="button" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
