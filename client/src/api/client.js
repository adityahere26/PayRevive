// Centralized API client. Every network call to the backend goes through here — no
// component should hardcode a backend URL or reimplement JWT/error handling
// (ARCHITECTURE.md § API contract; SECURITY.md § Frontend security).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

const TOKEN_STORAGE_KEY = "payrevive.token";

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiClientError extends Error {
  constructor(status, code, message, requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Thin fetch wrapper: resolves the base URL, attaches the bearer token when present, and
 * turns the backend's uniform `{ error: { code, message, requestId } }` shape into a typed
 * ApiClientError instead of making every caller check response.ok by hand.
 */
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = payload?.error || {};
    throw new ApiClientError(
      res.status,
      err.code || "UNKNOWN_ERROR",
      err.message || "Request failed",
      err.requestId || null
    );
  }

  return payload;
}

export const api = {
  health: () => request("/health"),
  authDemo: () => request("/auth/demo", { method: "POST" }),
  me: () => request("/auth/me"),
};
