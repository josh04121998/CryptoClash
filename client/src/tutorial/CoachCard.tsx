import { CoachContent } from "./beats.js";

export interface CoachCardProps {
  content: CoachContent;
  onSkipTip?: () => void;
  showSkipTip?: boolean;
}

export function CoachCard({ content, onSkipTip, showSkipTip }: CoachCardProps) {
  return (
    <div className="coach-card" role="dialog" aria-label="Tutorial coach">
      <div className="coach-card__header">
        <span className="coach-card__title">{content.title}</span>
        {content.keyword && <span className="coach-card__pill">{content.keyword}</span>}
      </div>
      <p className="coach-card__body">{content.body}</p>
      {showSkipTip && onSkipTip && (
        <button type="button" className="coach-card__skip" onClick={onSkipTip}>
          Skip tip
        </button>
      )}
    </div>
  );
}
