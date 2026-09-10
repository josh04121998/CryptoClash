import { afterEach, describe, expect, it } from "vitest";
import { apiUrl } from "./api.js";

afterEach(() => {
  delete (import.meta.env as Record<string, unknown>).VITE_SERVER_URL;
});

describe("apiUrl", () => {
  it("falls back to the local dev default when VITE_SERVER_URL isn't set", () => {
    expect(apiUrl()).toBe("http://localhost:8787");
  });

  it("passes through a URL with no trailing slash unchanged", () => {
    (import.meta.env as Record<string, unknown>).VITE_SERVER_URL = "http://example.com:8787";
    expect(apiUrl()).toBe("http://example.com:8787");
  });

  // Regression test for the session-1 production bug (STATUS.md): a missing
  // trailing-slash strip meant apiFetch's `${apiUrl()}${path}` produced a
  // double slash (".../  /api/...") for every request, which 404'd silently.
  it("strips a trailing slash so apiFetch's template literal doesn't double up", () => {
    (import.meta.env as Record<string, unknown>).VITE_SERVER_URL = "http://example.com:8787/";
    expect(apiUrl()).toBe("http://example.com:8787");
  });

  it("strips multiple trailing slashes", () => {
    (import.meta.env as Record<string, unknown>).VITE_SERVER_URL = "http://example.com:8787///";
    expect(apiUrl()).toBe("http://example.com:8787");
  });

  it("rewrites a ws:// scheme to http://", () => {
    (import.meta.env as Record<string, unknown>).VITE_SERVER_URL = "ws://example.com:8787";
    expect(apiUrl()).toBe("http://example.com:8787");
  });

  it("rewrites a wss:// scheme to https://, including a trailing slash", () => {
    (import.meta.env as Record<string, unknown>).VITE_SERVER_URL = "wss://example.com/";
    expect(apiUrl()).toBe("https://example.com");
  });
});
