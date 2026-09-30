import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The WAI-ARIA APG "Dialog (Modal)" keyboard pattern, applied uniformly to every role="dialog"
 * overlay in the client — flagged as a real, repeatedly-deprioritized gap across sessions
 * 19/24/26 ("focus-trapping/restoration for the four dialogs... not attempted", "the inspect
 * overlay has no keyboard-only path... consistent with this codebase's existing 'documented gap,
 * not built' pattern"). Attach the returned ref to the dialog's outermost element (give it
 * `tabIndex={-1}` too, as a focus target of last resort if the dialog somehow has no focusable
 * children).
 *
 * - Moves focus into the dialog on mount (its first focusable element, or the dialog root itself).
 * - Traps Tab/Shift+Tab cycling to the dialog's own focusable elements — the page behind a modal
 *   never receives focus while it's open, standard modal behavior every screen-reader/keyboard
 *   user expects and none of this app's dialogs had before now.
 * - Restores focus to whatever was focused before the dialog opened, once it closes/unmounts —
 *   so closing a dialog opened from a card grid, say, drops focus back on that exact card, not
 *   back at the top of the page.
 * - Escape triggers `onClose`, only when the caller actually has one unambiguous close action.
 *   A dialog with two live choices and no single "cancel" (e.g. the tutorial offer's Learn/Skip,
 *   or a tutorial-exit result screen's Practice/Main-menu) deliberately omits `onClose` — there's
 *   no action Escape could stand in for without inventing behavior nobody asked for.
 */
export function useFocusTrap<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    (focusables()[0] ?? dialog).focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !dialog!.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog!.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // Intentionally mount/unmount-only: a dialog's identity (and its onClose) doesn't change
    // mid-life in any real caller here, and re-running this on every onClose reference change
    // would re-steal focus and re-save "previously focused" mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
