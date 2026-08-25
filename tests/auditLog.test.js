// Tests for GET /api/audit-log (server/src/routes/auditLog.js) — the merchant-wide
// counterpart to the existing per-case GET /api/recovery-cases/:id/audit. Same AuditLog
// collection (server/src/models/AuditLog.js), same audit/auditLogger.js writer — this route
// adds no new audit-writing logic, only a merchant-scoped, paginated, filterable read.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";

let ctx;

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, Customer, Payment, RecoveryCase, AuditLog } = ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
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

async function createAndEvaluateCase(token, overrides = {}) {
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload(overrides)),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });
  return created.recoveryCase._id;
}

test("GET /api/audit-log requires authentication", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/audit-log`);
  assert.equal(res.status, 401);
});

test("GET /api/audit-log returns real events newest-first, with the eventType facet populated", async () => {
  const { token } = await demoToken();
  await createAndEvaluateCase(token);

  const res = await authedFetch("/api/audit-log", token);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.ok(body.total >= 5, "a single evaluated case produces at least 5 audit events (risk detected + 4 pipeline stages)");
  assert.equal(body.events.length, body.total < 25 ? body.total : 25);
  for (let i = 1; i < body.events.length; i++) {
    assert.ok(new Date(body.events[i - 1].timestamp) >= new Date(body.events[i].timestamp), "newest first");
  }
  assert.ok(body.eventTypes.includes("REVENUE_RISK_DETECTED"));
  assert.ok(body.eventTypes.includes("POLICY_EVALUATED"));
});

test("GET /api/audit-log filters by eventType exactly", async () => {
  const { token } = await demoToken();
  await createAndEvaluateCase(token);
  await createAndEvaluateCase(token, { amount: 150000 });

  const res = await authedFetch("/api/audit-log?eventType=REVENUE_RISK_DETECTED", token);
  const body = await res.json();

  assert.equal(body.total, 2);
  for (const e of body.events) assert.equal(e.eventType, "REVENUE_RISK_DETECTED");
});

test("GET /api/audit-log search matches reason/result substrings", async () => {
  const { token } = await demoToken();
  await createAndEvaluateCase(token, { amount: 150000 }); // -> HIGH_VALUE_REQUIRES_REVIEW

  const res = await authedFetch("/api/audit-log?search=HIGH_VALUE", token);
  const body = await res.json();

  assert.ok(body.total >= 1);
  assert.ok(body.events.some((e) => e.reason === "HIGH_VALUE_REQUIRES_REVIEW"));
});

test("GET /api/audit-log paginates without overlap or gaps", async () => {
  const { token } = await demoToken();
  await createAndEvaluateCase(token);
  await createAndEvaluateCase(token, { amount: 150000 });

  const full = await authedFetch("/api/audit-log?limit=100", token).then((r) => r.json());
  // 6 events from the retryable/low-value case (risk detected + all 5 pipeline stages) + 3
  // from the high-value case (risk detected + root cause + eligibility, which escalates
  // before scoring/intervention/policy ever run) = 9.
  assert.ok(full.total >= 9);

  const pageSize = 4;
  const page1 = await authedFetch(`/api/audit-log?page=1&limit=${pageSize}`, token).then((r) => r.json());
  const page2 = await authedFetch(`/api/audit-log?page=2&limit=${pageSize}`, token).then((r) => r.json());

  assert.equal(page1.events.length, pageSize);
  assert.equal(page2.events.length, pageSize);
  const page1Ids = new Set(page1.events.map((e) => e._id));
  for (const e of page2.events) assert.ok(!page1Ids.has(e._id), "no overlap between pages");
  assert.deepEqual(
    full.events.slice(0, pageSize * 2).map((e) => e._id),
    [...page1.events, ...page2.events].map((e) => e._id)
  );
});

test("GET /api/audit-log a malformed caseId filter returns zero results, never a 500", async () => {
  const { token } = await demoToken();
  await createAndEvaluateCase(token);

  const res = await authedFetch("/api/audit-log?caseId=not-a-real-object-id", token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.events, []);
});

test("GET /api/audit-log never leaks another merchant's events — merchant isolation", async () => {
  const { signMerchantToken, DEMO_TOKEN_TTL } = await import("../server/src/lib/jwt.js");
  const { Merchant } = ctx.models;

  const { token: tokenA } = await demoToken();
  const caseIdA = await createAndEvaluateCase(tokenA);

  const merchantB = await Merchant.create({ email: "audit-merchant-b@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: DEMO_TOKEN_TTL });
  const caseIdB = await createAndEvaluateCase(tokenB, { amount: 5000 });

  const resA = await authedFetch("/api/audit-log?limit=100", tokenA).then((r) => r.json());
  const resB = await authedFetch("/api/audit-log?limit=100", tokenB).then((r) => r.json());

  assert.ok(resA.events.every((e) => e.caseId !== caseIdB), "merchant A never sees merchant B's case events");
  assert.ok(resB.events.every((e) => e.caseId !== caseIdA), "merchant B never sees merchant A's case events");
  assert.ok(resA.events.some((e) => e.caseId === caseIdA));
  assert.ok(resB.events.some((e) => e.caseId === caseIdB));
});
