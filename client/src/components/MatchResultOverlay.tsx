import { PlayerId } from "@cryptoclash/engine";
import { useMemo } from "react";

export interface MatchResultOverlayProps {
  winner: PlayerId | "Draw";
  myPlayerId: PlayerId;
  onDismiss: () => void;
  /** tutorial_v1 exit variant */
  tutorialExit?: boolean;
  onPracticeAi?: () => void;
  onMainMenu?: () => void;
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

export function MatchResultOverlay({
  winner,
  myPlayerId,
  onDismiss,
  tutorialExit,
  onPracticeAi,
  onMainMenu,
}: MatchResultOverlayProps) {
  const outcome: "win" | "loss" | "draw" = winner === "Draw" ? "draw" : winner === myPlayerId ? "win" : "loss";
  const strips = useMemo(() => (outcome !== "loss" ? makeStrips(outcome === "win" ? 60 : 30) : []), [outcome]);

  const title = tutorialExit
    ? "You've got the basics."
    : outcome === "win"
      ? "YOU WIN"
      : outcome === "loss"
        ? "YOU LOSE"
        : "DRAW";

  return (
    <div className="match-result__backdrop" onClick={tutorialExit ? undefined : onDismiss}>
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
      <div
        className={`match-result__card match-result__card--${outcome}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-result-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="match-result__title" id="match-result-title">
          {title}
        </span>
        {tutorialExit ? (
          <div className="match-result__tutorial-actions">
            <button type="button" onClick={onPracticeAi}>
              Practice vs AI
            </button>
            <button type="button" onClick={onMainMenu}>
              Main menu
            </button>
          </div>
        ) : (
          <button type="button" onClick={onDismiss}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
