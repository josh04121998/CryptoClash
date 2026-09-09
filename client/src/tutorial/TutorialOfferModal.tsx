export interface TutorialOfferModalProps {
  onAccept: () => void;
  onSkip: () => void;
}

export function TutorialOfferModal({ onAccept, onSkip }: TutorialOfferModalProps) {
  return (
    <div className="tutorial-offer__backdrop" role="dialog" aria-modal="true" aria-label="Tutorial offer">
      <div className="tutorial-offer__card">
        <h2 className="tutorial-offer__title">Learn the floor (2 min)</h2>
        <p className="tutorial-offer__body">
          One guided match — Energy, summoning sickness, Rush, Guard, and face damage. Always skippable.
        </p>
        <div className="tutorial-offer__actions">
          <button type="button" className="tutorial-offer__primary" onClick={onAccept}>
            Learn the floor
          </button>
          <button
            type="button"
            className="tutorial-offer__secondary"
            onClick={() => {
              if (window.confirm("Jump to free play?")) onSkip();
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
