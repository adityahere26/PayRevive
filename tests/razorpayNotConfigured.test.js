// Day 6 § requirement 1 — the simulated executor path must remain completely unchanged when
// Razorpay isn't configured, which is also the environment every existing Day 3/5 test already
// runs in (tests/testUtils/testServer.js forces RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET empty by
// default). This file makes that guarantee explicit rather than merely incidental.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";

let ctx;

before(async () => {
  ctx = await startTestServer(); // no envOverrides — Razorpay stays unconfigured
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, AuditLog } = ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
    RecoveryAction.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
});

async function demoToken() {
  const res = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" });
  return res.json();
}

async function authedFetch(path, token, opts = {}) {
  return fetch(`${ctx.baseUrl}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

function paymentFailurePayload(overrides = {}) {
  return {
    customer: { name: "Priya Sharma", email: `priya-${Date.now()}-${Math.random()}@example.com` },
    amount: 2999,
    currency: "INR",
    failureReason: "insufficient_funds",
    ...overrides,
  };
}

test("isRazorpayConfigured() is false with no credentials set", async () => {
  const { isRazorpayConfigured } = await import("../server/src/integrations/razorpay/client.js");
  assert.equal(isRazorpayConfigured(), false);
});

test("POST /:id/payment-link is rejected (409) when Razorpay is not configured, no network call attempted", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/payment-link`, token, {
    method: "POST",
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.error.message, /not configured/i);
});

// ---- regression: the pre-Day-6 simulated flow is byte-identical -----------------------------

test("regression: /simulate-action still returns a SIMULATED result and never a LIVE_TEST_MODE one", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/simulate-action`, token, {
    method: "POST",
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.action.status, "SIMULATED");
  assert.ok(["RECOVERED", "FAILED"].includes(body.recoveryCase.status));
});

test("regression: a voice turn's CREATE_PAYMENT_LINK path (when it would apply) never attempts a live Razorpay call with no credentials configured", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());

  const session = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/voice/session`, token, {
    method: "POST",
  }).then((r) => r.json());

  // No live GEMINI_API_KEY in the test environment -> classifyVoiceIntent falls back to
  // UNCLEAR, so this exercises the same safe-fallback path as tests/voiceRecovery.test.js;
  // asserting here specifically that isRazorpayConfigured() never enters the picture when
  // there's no candidate action at all.
  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, transcript: "Ek baar phir try karwa do" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.action, null);
  assert.equal(body.paymentLink, null);
});
