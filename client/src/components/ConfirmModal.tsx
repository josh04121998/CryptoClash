export interface ConfirmModalProps {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-theme replacement for window.confirm() — reuses the tutorial-offer modal's
 * existing visual language (that styling was already generic, not tutorial-specific). */
export function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="tutorial-offer__backdrop" onClick={onCancel}>
      <div
        className="tutorial-offer__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="tutorial-offer__title" id="confirm-modal-title">
          {title}
        </h2>
        {body && <p className="tutorial-offer__body">{body}</p>}
        <div className="tutorial-offer__actions">
          <button type="button" className="tutorial-offer__primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="tutorial-offer__secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
