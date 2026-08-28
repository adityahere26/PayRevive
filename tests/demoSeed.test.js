// The deterministic Buildathon demo dataset (server/src/services/demoSeed.js):
// 100 total clients, 90 successful payments, 10 failed payments — all from real persisted
// records, with the 10 failed payments carried through the EXISTING recovery pipeline (no
// hardcoded outcomes, no frontend-only rows). Runs the real app against an in-memory MongoDB.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";

let ctx;
let seedDemoDataset;

before(async () => {
  ctx = await startTestServer();
  ({ seedDemoDataset } = await import("../server/src/services/demoSeed.js"));
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, RecoveryPlan, AuditLog } = ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
    RecoveryAction.deleteMany({}),
    RecoveryPlan.deleteMany({}),
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

// ---- 1. the seed returns the exact headline counts ------------------------------------------

test("1: seedDemoDataset produces exactly 100 clients / 90 passed / 10 failed", async () => {
  const { merchant } = await demoToken();
  const summary = await seedDemoDataset({ merchantId: merchant.id });

  assert.equal(summary.totalClients, 100);
  assert.equal(summary.paymentsPassed, 90);
  assert.equal(summary.paymentsFailed, 10);
  assert.equal(summary.outcomes.length, 10);
});

// ---- 2. those counts are backed by real persisted records ---------------------------------

test("2: the persisted DB matches — 100 Customer, 90 paid Payment, 10 failed Payment", async () => {
  const { merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });
  const { Customer, Payment } = ctx.models;
  const mid = merchant.id;

  assert.equal(await Customer.countDocuments({ merchantId: mid }), 100);
  assert.equal(await Payment.countDocuments({ merchantId: mid, status: "paid" }), 90);
  assert.equal(await Payment.countDocuments({ merchantId: mid, status: "failed" }), 10);
  // sanity: total payments = 100, and every payment points at a real customer of this merchant
  const payments = await Payment.find({ merchantId: mid });
  assert.equal(payments.length, 100);
  const customerIds = new Set((await Customer.find({ merchantId: mid })).map((c) => String(c._id)));
  for (const p of payments) assert.ok(customerIds.has(String(p.customerId)), "payment → real customer");
});

// ---- 3. the payments-overview endpoint reports the same, with 10 failed rows --------------

test("3: GET /api/dashboard/payments-overview reports 100 / 90 / 10 and lists exactly the 10 failed payments", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });

  const overview = await authedFetch("/api/dashboard/payments-overview", token).then((r) => r.json());
  assert.equal(overview.totalClients, 100);
  assert.equal(overview.paymentsPassed, 90);
  assert.equal(overview.paymentsFailed, 10);
  assert.equal(overview.failedPayments.length, 10);
  assert.equal(overview.totalFailedPayments, 10);
});

// ---- 4. every failed row maps to a real persisted failed Payment + Customer ---------------

test("4: each failed row maps to an actual persisted failed Payment and Customer", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });
  const { Payment, Customer } = ctx.models;

  const overview = await authedFetch("/api/dashboard/payments-overview", token).then((r) => r.json());
  for (const row of overview.failedPayments) {
    const payment = await Payment.findOne({ _id: row.paymentId, merchantId: merchant.id });
    assert.ok(payment, `row.paymentId ${row.paymentId} is a real Payment`);
    assert.equal(payment.status, "failed");
    assert.equal(payment.amount, row.amount);
    assert.equal(payment.failureReason, row.failureReason);

    const customer = await Customer.findOne({ _id: row.customerId, merchantId: merchant.id });
    assert.ok(customer, "row.customerId is a real Customer");
    assert.equal(customer.name, row.customerName);
  }
});

// ---- 5. failed rows that entered recovery map to a real RecoveryCase for the same payment --

test("5: failed rows carry a real RecoveryCase tied to the same payment (relationship intact)", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });
  const { RecoveryCase } = ctx.models;

  const overview = await authedFetch("/api/dashboard/payments-overview", token).then((r) => r.json());
  // every failed payment got a RecoveryCase (riskDetector runs for all 10)
  let withCase = 0;
  for (const row of overview.failedPayments) {
    assert.ok(row.recoveryCase, "failed row has a joined recovery case");
    const rc = await RecoveryCase.findOne({ _id: row.recoveryCase.id, merchantId: merchant.id });
    assert.ok(rc, "row.recoveryCase.id is a real RecoveryCase for this merchant");
    assert.equal(String(rc.paymentId), String(row.paymentId), "case ↔ payment relationship");
    assert.equal(String(rc.customerId), String(row.customerId), "case ↔ customer relationship");
    withCase += 1;
  }
  assert.equal(withCase, 10);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchant.id }), 10);
});

// ---- 6. the recovery plan operates on the real failed cases ------------------------------

test("6: the PENDING_APPROVAL recovery plan holds the actually-planned failed cases", async () => {
  const { token, merchant } = await demoToken();
  const summary = await seedDemoDataset({ merchantId: merchant.id });
  const { RecoveryCase, RecoveryPlan } = ctx.models;

  const planRes = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());
  assert.ok(planRes.plan, "a current recovery plan exists");
  assert.equal(planRes.plan.status, "PENDING_APPROVAL");
  assert.equal(String(planRes.plan.id), String(summary.recoveryPlanId));

  // 9 of the 10 failed cases were planned (one is left freshly-detected / recoverable).
  assert.equal(planRes.plan.items.length, 9);
  for (const item of planRes.plan.items) {
    const rc = await RecoveryCase.findOne({ _id: item.caseId, merchantId: merchant.id });
    assert.ok(rc, "plan item → real RecoveryCase for this merchant");
    assert.equal(item.amount, rc.amount);
  }

  // nothing has been executed — this is a plan awaiting the single merchant confirmation
  assert.equal(planRes.plan.summary.executed, 0);
  assert.equal(planRes.plan.summary.pending, 9);
  assert.equal(planRes.plan.summary.recoverable, 6); // 4 payment-link + 2 voice, customer-facing

  const dbPlan = await RecoveryPlan.findById(summary.recoveryPlanId);
  assert.equal(String(dbPlan.merchantId), String(merchant.id));
});

// ---- 7. outcomes are the policy engine's real decisions (varied states, not fixtures) -----

test("7: the pipeline produces a spread of real states across the 10 failed cases", async () => {
  const { merchant } = await demoToken();
  const summary = await seedDemoDataset({ merchantId: merchant.id });

  const byKey = (o) => o.selectedIntervention || o.status;
  const keys = summary.outcomes.map(byKey);

  assert.ok(keys.filter((k) => k === "CREATE_PAYMENT_LINK").length >= 3, "several payment-link decisions");
  assert.ok(keys.includes("START_VOICE_RECOVERY"), "at least one voice decision");
  assert.ok(keys.includes("ESCALATED"), "a high-value case escalated");
  assert.ok(keys.includes("STOPPED"), "an opted-out case stopped");
  assert.ok(keys.includes("EXPIRED"), "an out-of-window case expired");
  assert.ok(keys.includes("RISK_DETECTED"), "a freshly-detected (recoverable) case");

  // every designed expectation was met by the real engine
  for (const o of summary.outcomes) {
    assert.equal(o.matchedExpectation, true, `case ${o.customerIndex}: expected ${o.expected}, got ${byKey(o)}`);
  }
});

// ---- 8. dashboard summary reflects real aggregation; nothing is falsely "recovered" -------

test("8: GET /api/dashboard/summary aggregates the seeded cases and shows zero recovered revenue", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });

  const s = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(s.totalCases, 10);
  assert.equal(s.recoveredRevenue, 0); // approval-gated: no customer-facing action has run yet
  assert.equal(s.recoveredCases, 0);
  assert.equal(s.statusBreakdown.ESCALATED, 1);
  assert.equal(s.statusBreakdown.STOPPED, 1);
  assert.equal(s.statusBreakdown.EXPIRED, 1);
  assert.equal(s.statusBreakdown.RISK_DETECTED, 1);
  assert.equal(s.statusBreakdown.POLICY_APPROVED, 6);
  assert.equal(s.recoveryAutomation.plansAwaitingApproval, 1);
  assert.equal(s.recoveryAutomation.customersAwaitingApproval, 6);
});

// ---- 9. merchant isolation -----------------------------------------------------------------

test("9: seeding one merchant leaves another merchant's (empty) data untouched", async () => {
  const { token: demoTokenA, merchant: demoMerchant } = await demoToken();
  await seedDemoDataset({ merchantId: demoMerchant.id });

  const { Merchant, Customer, Payment } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const merchantB = await Merchant.create({ email: "merchant-b-seed@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  const overviewB = await authedFetch("/api/dashboard/payments-overview", tokenB).then((r) => r.json());
  assert.equal(overviewB.totalClients, 0);
  assert.equal(overviewB.paymentsPassed, 0);
  assert.equal(overviewB.paymentsFailed, 0);
  assert.equal(overviewB.failedPayments.length, 0);
  const planB = await authedFetch("/api/recovery-plan/current", tokenB).then((r) => r.json());
  assert.equal(planB.plan, null);

  // seeding merchant B does not disturb the demo merchant's dataset
  await seedDemoDataset({ merchantId: merchantB._id });
  assert.equal(await Customer.countDocuments({ merchantId: demoMerchant.id }), 100);
  assert.equal(await Payment.countDocuments({ merchantId: demoMerchant.id, status: "paid" }), 90);
  assert.equal(await Payment.countDocuments({ merchantId: merchantB._id, status: "failed" }), 10);

  const overviewA = await authedFetch("/api/dashboard/payments-overview", demoTokenA).then((r) => r.json());
  assert.equal(overviewA.totalClients, 100);
  assert.equal(overviewA.paymentsFailed, 10);
});

// ---- 10. deterministic — re-seeding resets and reproduces the same scenario ---------------

test("10: re-seeding is a reset + reproduces identical counts and case outcomes", async () => {
  const { merchant } = await demoToken();
  const first = await seedDemoDataset({ merchantId: merchant.id });
  const second = await seedDemoDataset({ merchantId: merchant.id });
  const { Customer, Payment } = ctx.models;

  assert.equal(await Customer.countDocuments({ merchantId: merchant.id }), 100); // reset, not doubled
  assert.equal(await Payment.countDocuments({ merchantId: merchant.id }), 100);

  assert.deepEqual(
    first.outcomes.map((o) => [o.customerIndex, o.failureReason, o.amount, o.status, o.selectedIntervention]),
    second.outcomes.map((o) => [o.customerIndex, o.failureReason, o.amount, o.status, o.selectedIntervention])
  );
});

// ---- 11. the HTTP seed endpoint ---------------------------------------------------------

test("11: POST /api/demo/seed seeds via HTTP and requires authentication", async () => {
  const unauth = await fetch(`${ctx.baseUrl}/api/demo/seed`, { method: "POST" });
  assert.equal(unauth.status, 401);

  const { token } = await demoToken();
  const res = await authedFetch("/api/demo/seed", token, { method: "POST" });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.totalClients, 100);
  assert.equal(body.paymentsPassed, 90);
  assert.equal(body.paymentsFailed, 10);

  const overview = await authedFetch("/api/dashboard/payments-overview", token).then((r) => r.json());
  assert.equal(overview.failedPayments.length, 10);
});
