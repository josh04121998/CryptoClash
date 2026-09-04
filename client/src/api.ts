const DEFAULT_API_URL = "http://localhost:8787";

/** Same server as the WebSocket match server (see useOnlineMatch.ts's serverUrl()) — just the http(s):// scheme instead of ws(s)://. */
export function apiUrl(): string {
  const configured = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? DEFAULT_API_URL;
  return configured.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${apiUrl()}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as T;
}
