import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusTrap } from "./useFocusTrap.js";

function Dialog({ onClose }: { onClose?: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Test dialog">
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

/** A minimal stand-in for any of this app's real dialogs: an opener button, then a dialog with
 * two focusable buttons, mounted the same way every real caller does (conditional JSX). */
function Harness({ onClose }: { onClose?: () => void }) {
  return (
    <div>
      <button type="button">Opener</button>
      <Dialog onClose={onClose} />
    </div>
  );
}

/** Opens the dialog on click, closes it via `onClose` — the real "trigger element -> dialog
 * mounts -> dialog closes -> focus returns to the trigger" shape every real caller uses. */
function ToggleHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Opener
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </div>
  );
}

afterEach(cleanup);

describe("useFocusTrap", () => {
  it("moves focus to the dialog's first focusable element on mount", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByText("First"));
  });

  it("falls back to focusing the dialog root itself when it has no focusable children", () => {
    function EmptyDialog() {
      const ref = useFocusTrap<HTMLDivElement>();
      return (
        <div ref={ref} tabIndex={-1} role="dialog" aria-label="Empty">
          <p>Nothing to focus here.</p>
        </div>
      );
    }
    render(<EmptyDialog />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    render(<Harness />);
    const last = screen.getByText("Last");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("First"));
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    render(<Harness />);
    const first = screen.getByText("First");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("Last"));
  });

  it("calls onClose on Escape when a caller provides one", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing on Escape when no onClose is provided (an ambiguous, multi-choice dialog)", () => {
    // Regression guard for the real reason some callers (TutorialOfferModal's Learn/Skip,
    // MatchResultOverlay's tutorial-exit Practice/Main-menu) omit onClose entirely: Escape must
    // not invent a close action nobody asked for. Asserting only "doesn't throw" here — there's
    // no closeable behavior to observe when onClose is absent by design.
    render(<Harness />);
    expect(() => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })).not.toThrow();
  });

  it("restores focus to whatever was focused before the dialog mounted, once it unmounts", () => {
    render(<ToggleHarness />);
    const opener = screen.getByText("Opener");
    opener.focus();
    fireEvent.click(opener); // mounts the dialog while `opener` is the focused element
    expect(document.activeElement).toBe(screen.getByText("First"));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });
});
