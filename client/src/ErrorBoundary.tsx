import { Component, ErrorInfo, ReactNode } from "react";
import { track } from "./telemetry.js";

/**
 * The app had no error boundary at all, which in React 18 means a thrown render
 * error unmounts the entire tree — the player gets a blank page, with no way
 * back and no signal that anything happened. That is survivable while the only
 * users are us; at launch it is the difference between one broken card render
 * costing a player a match and costing you the player.
 *
 * Two jobs, in order of importance:
 *
 * 1. **Keep the player.** Offer a way out that isn't "reload and hope" — the
 *    board is gone either way, but the menu, collection and packs are almost
 *    certainly still fine, because the failure is nearly always local to one
 *    screen.
 * 2. **Tell us.** Emit a `client_error` event. There is no Sentry here, so this
 *    is the only channel by which a production crash becomes knowable at all.
 *    Deliberately minimal: the error's name and a truncated message, plus which
 *    boundary caught it. **No stack trace and no component tree** — stacks can
 *    carry values from the render that threw, and the telemetry contract's
 *    no-PII rule outranks debugging convenience.
 *
 * Note what this does NOT catch, so it isn't mistaken for full coverage: event
 * handlers, async callbacks, and anything outside React's render/lifecycle.
 * Those still fail silently. `telemetry.ts` swallows its own failures by design,
 * so reporting can never itself become the crash.
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Identifies which boundary fired, so a crash can be located without a stack. */
  where: string;
  /** Rendered instead of the default panel — used for inner boundaries that should degrade quietly. */
  fallback?: (reset: () => void) => ReactNode;
  /** Invoked by the default panel's escape hatch; omit it and the panel offers a reload instead. */
  onRecover?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Long enough to identify the failure, short enough that no message body rides along. */
const MAX_REPORTED_MESSAGE = 64;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Still log locally: a developer with the console open should see the real
    // error and its component stack, which is exactly what we refuse to ship.
    console.error(`[${this.props.where}]`, error, info.componentStack);
    track("client_error", {
      where: this.props.where,
      name: String(error.name ?? "Error").slice(0, MAX_REPORTED_MESSAGE),
      message: String(error.message ?? "").slice(0, MAX_REPORTED_MESSAGE),
    });
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onRecover?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="app error-boundary" role="alert">
        <div className="error-boundary__panel">
          <h2>Something broke.</h2>
          <p>
            That's on us, not you — and it's been reported. Your collection, decks and Coins are stored on the server and are
            unaffected.
          </p>
          <div className="error-boundary__actions">
            {this.props.onRecover && (
              <button type="button" onClick={this.reset}>
                Back to menu
              </button>
            )}
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
