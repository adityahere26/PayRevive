// Tests for the Dashboard analytics fields added to GET /api/dashboard/summary
// (server/src/routes/dashboard.js): interventionBreakdown, revenueByStatus. Also proves the
// honesty requirement from this session's brief: an Evaluation batch run (synthetic, never
// persisted as a RecoveryCase — see evaluation/batchEvaluator.js) can never change what the
// live Dashboard reports for the same merchant.

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
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, AuditLog, EvaluationRun } = ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
    RecoveryAction.deleteMany({}),
    AuditLog.deleteMany({}),
    EvaluationRun.deleteMany({}),
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

test("dashboard summary: interventionBreakdown only includes cases with a selected intervention, revenueByStatus matches statusBreakdown counts", async () => {
  const { token } = await demoToken();

  const low = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 2000, failureReason: "insufficient_funds" })),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${low.recoveryCase._id}/evaluate`, token, { method: "POST" });
  const afterEvaluate = await authedFetch(`/api/recovery-cases/${low.recoveryCase._id}`, token).then((r) => r.json());
  assert.equal(afterEvaluate.recoveryCase.status, "POLICY_APPROVED");
  assert.equal(afterEvaluate.recoveryCase.selectedIntervention, "CREATE_PAYMENT_LINK");

  const actionRes = await authedFetch(`/api/recovery-cases/${low.recoveryCase._id}/simulate-action`, token, {
    method: "POST",
  }).then((r) => r.json());
  const finalStatus = actionRes.recoveryCase.status; // RECOVERED or FAILED — seeded RNG, both valid

  const high = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 150000 })),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${high.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const summary = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());

  // The high-value case never reaches an intervention (escalated at eligibility) — only the
  // low-value case contributes to interventionBreakdown.
  const paymentLinkGroup = summary.interventionBreakdown.CREATE_PAYMENT_LINK;
  assert.ok(paymentLinkGroup, "CREATE_PAYMENT_LINK group exists");
  assert.equal(paymentLinkGroup.count, 1);
  assert.equal(paymentLinkGroup.revenue, 2000);
  assert.ok(paymentLinkGroup.recoveredRevenue === 0 || paymentLinkGroup.recoveredRevenue === 2000);
  assert.equal(Object.values(summary.interventionBreakdown).reduce((s, g) => s + g.count, 0), 1);

  // revenueByStatus must agree with statusBreakdown: every counted case's amount is reflected.
  assert.equal(summary.revenueByStatus.ESCALATED, 150000);
  assert.equal(summary.statusBreakdown.ESCALATED, 1);
  assert.equal(summary.revenueByStatus[finalStatus] >= 2000, true);
});

test("dashboard summary: an Evaluation batch run never changes what the live Dashboard reports (no synthetic leakage)", async () => {
  const { token } = await demoToken();

  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 4200 })),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const before = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());

  const evalRunRes = await authedFetch("/api/evaluation/run", token, {
    method: "POST",
    body: JSON.stringify({ count: 40 }),
  });
  assert.equal(evalRunRes.status, 201);

  const afterEval = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());

  assert.deepEqual(afterEval, before);

  const { RecoveryCase } = ctx.models;
  assert.equal(await RecoveryCase.countDocuments({}), 1, "only the one real case exists — the evaluation run created zero RecoveryCase documents");
});

test("GET /api/dashboard/summary requires authentication", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/dashboard/summary`);
  assert.equal(res.status, 401);
});
