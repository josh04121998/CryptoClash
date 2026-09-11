import { useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal.js";

export interface TutorialOfferModalProps {
  onAccept: () => void;
  onSkip: () => void;
}

export function TutorialOfferModal({ onAccept, onSkip }: TutorialOfferModalProps) {
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  return (
    <>
      <div className="tutorial-offer__backdrop">
        <div className="tutorial-offer__card" role="dialog" aria-modal="true" aria-labelledby="tutorial-offer-title">
          <h2 className="tutorial-offer__title" id="tutorial-offer-title">
            Learn the floor (2 min)
          </h2>
          <p className="tutorial-offer__body">
            One guided match — Energy, summoning sickness, Rush, Guard, and face damage. Always skippable.
          </p>
          <div className="tutorial-offer__actions">
            <button type="button" className="tutorial-offer__primary" onClick={onAccept}>
              Learn the floor
            </button>
            <button type="button" className="tutorial-offer__secondary" onClick={() => setConfirmingSkip(true)}>
              Skip
            </button>
          </div>
        </div>
      </div>
      {confirmingSkip && (
        <ConfirmModal
          title="Jump to free play?"
          confirmLabel="Skip tutorial"
          cancelLabel="Back"
          onConfirm={onSkip}
          onCancel={() => setConfirmingSkip(false)}
        />
      )}
    </>
  );
}
