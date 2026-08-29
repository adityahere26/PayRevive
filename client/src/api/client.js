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
  // Every deliberate "Enter Demo" resets the shared demo merchant to the canonical
  // 100 / 90 / 10 dataset (fresh PENDING_APPROVAL plan, nothing executed) via the official
  // merchant-scoped endpoint (server/src/routes/demo.js POST /seed -> services/demoSeed.js).
  // Called only from DemoEntry on the /demo route — never on a dashboard refresh or any
  // other request — so a demo in progress is never reset out from under the user.
  seedDemo: () => request("/demo/seed", { method: "POST" }),
  me: () => request("/auth/me"),

  dashboardSummary: () => request("/dashboard/summary"),
  // Business-owner Payments page — merchant-scoped overview + failed-payment list
  // (server/src/routes/dashboard.js GET /payments-overview).
  paymentsOverview: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/dashboard/payments-overview${query ? `?${query}` : ""}`);
  },

  simulatePaymentFailure: (payload) =>
    request("/demo/payment-failure", { method: "POST", body: payload }),

  listRecoveryCases: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/recovery-cases${query ? `?${query}` : ""}`);
  },
  getRecoveryCase: (id) => request(`/recovery-cases/${id}`),
  getRecoveryCaseAudit: (id) => request(`/recovery-cases/${id}/audit`),
  evaluateRecoveryCase: (id) => request(`/recovery-cases/${id}/evaluate`, { method: "POST" }),
  simulateRecoveryAction: (id) => request(`/recovery-cases/${id}/simulate-action`, { method: "POST" }),
  // Day 6 — real Razorpay Test Mode Payment Link, distinct from simulateRecoveryAction above.
  // Never sends any Razorpay credential — the browser never has one to send.
  createPaymentLink: (id) => request(`/recovery-cases/${id}/payment-link`, { method: "POST" }),

  // Approval-gated autonomy (ARCHITECTURE.md § Recovery plans). The merchant reads the one
  // prepared plan and confirms it once; confirmation is idempotent server-side.
  getCurrentRecoveryPlan: () => request("/recovery-plan/current"),
  getRecoveryPlan: (id) => request(`/recovery-plan/${id}`),
  confirmRecoveryPlan: (id) => request(`/recovery-plan/${id}/confirm`, { method: "POST" }),

  // DEMO control: completes the Razorpay Test Mode payment for cases awaiting an outcome by
  // delivering a signed payment_link.paid webhook to the real webhook route (no bypass).
  completeTestPayment: (caseId) =>
    request("/demo/complete-test-payment", { method: "POST", body: caseId ? { caseId } : {} }),

  // EVALUATION.md § Batch evaluation engine — synthetic data only, never a real Razorpay/
  // Gemini call. See server/src/routes/evaluation.js.
  runEvaluation: (count) => request("/evaluation/run", { method: "POST", body: count ? { count } : {} }),
  listEvaluationRuns: () => request("/evaluation"),
  getEvaluationRun: (id) => request(`/evaluation/${id}`),

  // AGENT_DESIGN.md § The ten modules (Audit Logger) — merchant-wide counterpart to
  // getRecoveryCaseAudit above. Same AuditLog collection, no second audit system.
  listAuditLog: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/audit-log${query ? `?${query}` : ""}`);
  },

  // RECOVERY_POLICY.md § Merchant policy fields. The Policy Engine reads merchant.policy
  // fresh from the database on every pipeline run — no separate policy logic lives here.
  getMerchantPolicy: () => request("/merchant/policy"),
  updateMerchantPolicy: (policy) => request("/merchant/policy", { method: "PUT", body: policy }),

  // ARCHITECTURE.md § Inbound payment-failure webhook. The webhook URL + signing secret a
  // business pastes into their Razorpay Dashboard to connect PayRevive without writing code.
  getIntegration: () => request("/merchant/integration"),
  // The signing secret is not in getIntegration/regenerate responses — fetched only on an
  // explicit merchant "Reveal" (server/src/routes/integration.js POST /reveal).
  revealWebhookSecret: () => request("/merchant/integration/reveal", { method: "POST" }),
  regenerateWebhookSecret: () => request("/merchant/integration/regenerate", { method: "POST" }),

  // AGENT_DESIGN.md § Voice pipeline. Every call here goes to the payrevive backend, never
  // directly to Gemini — the browser never sees any Gemini credential (SECURITY.md § Gemini /
  // AI provider security).
  startVoiceSession: (caseId) => request(`/recovery-cases/${caseId}/voice/session`, { method: "POST" }),
  sendVoiceTurn: (caseId, { sessionId, transcript }) =>
    request(`/recovery-cases/${caseId}/voice/turn`, { method: "POST", body: { sessionId, transcript } }),
  endVoiceSession: (caseId, sessionId) =>
    request(`/recovery-cases/${caseId}/voice/session/end`, { method: "POST", body: { sessionId } }),
};
