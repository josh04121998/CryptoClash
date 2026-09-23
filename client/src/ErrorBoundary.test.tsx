import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.js";

const tracked: Array<{ name: string; props?: Record<string, unknown> }> = [];
vi.mock("./telemetry.js", () => ({
  track: (name: string, props?: Record<string, unknown>) => {
    tracked.push({ name, props });
  },
}));

function Boom({ message = "kaboom" }: { message?: string }): JSX.Element {
  throw new Error(message);
}

beforeEach(() => {
  tracked.length = 0;
  // React logs caught render errors to console.error; silence it so a passing
  // run isn't full of red herrings, but keep it a spy so a genuinely unexpected
  // log is still inspectable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary where="test">
        <p>all fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all fine")).toBeTruthy();
    expect(tracked).toHaveLength(0);
  });

  it("catches a render error instead of letting it unmount the tree", () => {
    // The whole point: without a boundary React 18 unmounts everything and the
    // player gets a blank page.
    render(
      <ErrorBoundary where="test">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Something broke.")).toBeTruthy();
  });

  it("reports the crash as telemetry, with no stack trace", () => {
    render(
      <ErrorBoundary where="online-match">
        <Boom message="board exploded" />
      </ErrorBoundary>,
    );
    const report = tracked.find((t) => t.name === "client_error");
    expect(report).toBeTruthy();
    expect(report?.props?.where).toBe("online-match");
    expect(report?.props?.message).toBe("board exploded");
    // No-PII rule: a stack can carry values from the render that threw.
    const serialized = JSON.stringify(report?.props ?? {});
    expect(serialized).not.toMatch(/\bat\s+\w+.*:\d+:\d+/);
    expect(Object.keys(report?.props ?? {}).sort()).toEqual(["message", "name", "where"]);
  });

  it("truncates a long error message rather than shipping a body of text", () => {
    render(
      <ErrorBoundary where="test">
        <Boom message={"x".repeat(500)} />
      </ErrorBoundary>,
    );
    const report = tracked.find((t) => t.name === "client_error");
    expect(String(report?.props?.message).length).toBeLessThanOrEqual(64);
  });

  it("offers a way back and calls onRecover, so a crash costs one screen not the session", () => {
    const onRecover = vi.fn();
    render(
      <ErrorBoundary where="local-match" onRecover={onRecover}>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("offers only a reload when there is nowhere to recover to", () => {
    render(
      <ErrorBoundary where="root">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole("button", { name: "Back to menu" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("renders a custom fallback when given one", () => {
    render(
      <ErrorBoundary where="test" fallback={() => <p>quiet degrade</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("quiet degrade")).toBeTruthy();
    expect(screen.queryByText("Something broke.")).toBeNull();
  });

  it("never lets a telemetry failure become the crash", () => {
    // telemetry.ts swallows its own errors by design, but the boundary must not
    // depend on that being true — a throwing reporter still has to render the
    // fallback, or the error screen itself white-screens the app.
    const boom = new Error("reporter down");
    const spy = vi.spyOn(console, "error");
    expect(() =>
      render(
        <ErrorBoundary where="test">
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    expect(boom).toBeTruthy();
  });
});
