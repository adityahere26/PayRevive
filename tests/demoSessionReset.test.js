// FINAL DEMO UX pass — "a fresh demo session every time".
//
// DemoEntry (client/src/pages/DemoEntry.jsx) now performs, on every deliberate "Enter Demo"
// (the landing CTA -> /demo, nothing else): POST /api/auth/demo  then  POST /api/demo/seed.
// This file locks that contract down at the HTTP level:
//
//   - entering the demo yields the canonical 100 / 90 / 10 dataset with a fresh
//     PENDING_APPROVAL plan and zero recovered revenue;
//   - executing the recovery (confirming the plan) advances state and writes execution audit;
//   - RE-entering the demo returns to the pristine 100 / 90 / 10 state — no stale recovered
//     revenue, no completed plan, no execution history — so a judge can replay the full
//     journey any number of times;
//   - a plain authenticated dashboard read (GET summary / payments-overview) never resets
//     anything — only the demo-entry flow (POST /api/demo/seed) does;
//   - a non-demo merchant is never reset and cannot call the seed endpoint (404).
//
// Plus a static guard that the audit explanation UI keeps its text-wrapping classes.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startTestServer } from "./testUtils/testServer.js";

let ctx;

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, RecoveryPlan, AuditLog, WebhookEvent } =
    ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
    RecoveryAction.deleteMany({}),
    RecoveryPlan.deleteMany({}),
    AuditLog.deleteMany({}),
    WebhookEvent.deleteMany({}),
  ]);
});

// Mirrors exactly what DemoEntry.handleEnterDemo does on the /demo route.
async function enterDemo() {
  const { token, merchant } = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }).then((r) => r.json());
  const seedRes = await fetch(`${ctx.baseUrl}/api/demo/seed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(seedRes.status, 201, "POST /api/demo/seed succeeds on entry");
  return { token, merchant, seed: await seedRes.json() };
}

function authed(path, token, opts = {}) {
  return fetch(`${ctx.baseUrl}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

const EXECUTION_EVENT_TYPES = new Set([
  "RECOVERY_PLAN_APPROVED",
  "RECOVERY_EXECUTED",
  "ACTION_SIMULATED",
  "PAYMENT_LINK_CREATED",
  "VOICE_RECOVERY_STARTED",
  "PAYMENT_RECOVERY_SUCCEEDED",
]);

async function auditEventTypes(token) {
  const res = await authed("/api/audit-log?limit=100", token).then((r) => r.json());
  return res.events.map((e) => e.eventType);
}

// ---- 1. Enter demo -> fresh 100 / 90 / 10, plan PENDING_APPROVAL, nothing recovered --------

test("1: entering the demo produces the canonical 100/90/10 pristine state", async () => {
  const { token, seed } = await enterDemo();

  assert.equal(seed.totalClients, 100);
  assert.equal(seed.paymentsPassed, 90);
  assert.equal(seed.paymentsFailed, 10);

  const overview = await authed("/api/dashboard/payments-overview", token).then((r) => r.json());
  assert.equal(overview.totalClients, 100);
  assert.equal(overview.paymentsPassed, 90);
  assert.equal(overview.paymentsFailed, 10);
  assert.equal(overview.failedPayments.length, 10);

  const summary = await authed("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(summary.recoveredRevenue, 0, "no recovered revenue on a fresh session");
  assert.equal(summary.recoveredCases, 0);

  const plan = (await authed("/api/recovery-plan/current", token).then((r) => r.json())).plan;
  assert.ok(plan, "a recovery plan exists");
  assert.equal(plan.status, "PENDING_APPROVAL");
  assert.equal(plan.approvedBy, null);
  assert.equal(plan.approvedAt, null);
  assert.equal(plan.summary.executed, 0);

  // Audit starts clean: only detection / planning events, no execution history.
  const types = await auditEventTypes(token);
  assert.ok(types.length > 0, "setup audit events were written");
  assert.ok(types.includes("REVENUE_RISK_DETECTED"));
  for (const t of types) {
    assert.equal(EXECUTION_EVENT_TYPES.has(t), false, `no execution event in a fresh session (saw ${t})`);
  }
});

// ---- 2 + 3. Execute the recovery, then re-enter -> pristine again --------------------------

test("2+3: after executing the recovery, re-entering the demo restores the pristine state", async () => {
  const first = await enterDemo();

  // Execute — the single merchant confirmation.
  const planId = (await authed("/api/recovery-plan/current", first.token).then((r) => r.json())).plan.id;
  const confirm = await authed(`/api/recovery-plan/${planId}/confirm`, first.token, { method: "POST" });
  assert.equal(confirm.status, 200);
  const confirmedPlan = (await confirm.json()).plan;
  assert.notEqual(confirmedPlan.status, "PENDING_APPROVAL", "plan advanced out of PENDING_APPROVAL");
  assert.equal(confirmedPlan.approvedBy, "MERCHANT");

  const dirtyTypes = await auditEventTypes(first.token);
  assert.ok(
    dirtyTypes.some((t) => EXECUTION_EVENT_TYPES.has(t)),
    "executing the recovery wrote execution audit events"
  );

  // Re-enter the demo (leave -> landing -> Enter Demo again). Same stable demo merchant,
  // freshly re-authenticated and re-seeded.
  const second = await enterDemo();
  assert.equal(second.merchant.id, first.merchant.id, "the demo merchant is stable across sessions");

  const overview = await authed("/api/dashboard/payments-overview", second.token).then((r) => r.json());
  assert.equal(overview.totalClients, 100);
  assert.equal(overview.paymentsPassed, 90);
  assert.equal(overview.paymentsFailed, 10);

  const summary = await authed("/api/dashboard/summary", second.token).then((r) => r.json());
  assert.equal(summary.recoveredRevenue, 0, "no stale recovered revenue carries into the next session");
  assert.equal(summary.recoveredCases, 0, "no stale recovered cases");
  assert.equal(summary.recoveryAutomation.plansAwaitingApproval, 1);

  const plan = (await authed("/api/recovery-plan/current", second.token).then((r) => r.json())).plan;
  assert.equal(plan.status, "PENDING_APPROVAL", "fresh plan awaiting approval");
  assert.equal(plan.approvedBy, null);
  assert.equal(plan.summary.executed, 0);

  // Audit trail for the new session has no execution history from the previous run.
  const cleanTypes = await auditEventTypes(second.token);
  for (const t of cleanTypes) {
    assert.equal(EXECUTION_EVENT_TYPES.has(t), false, `audit trail is clean for the new session (saw ${t})`);
  }
});

// ---- 4. A dashboard refresh does NOT reset the demo ---------------------------------------

test("4: reading the dashboard repeatedly never resets the demo (only the entry flow does)", async () => {
  const { token } = await enterDemo();

  const planId = (await authed("/api/recovery-plan/current", token).then((r) => r.json())).plan.id;
  await authed(`/api/recovery-plan/${planId}/confirm`, token, { method: "POST" });

  const afterConfirm = await authed("/api/dashboard/summary", token).then((r) => r.json());

  // Simulate a judge refreshing / navigating around: many authenticated GETs, no seed call.
  for (let i = 0; i < 5; i++) {
    await authed("/api/dashboard/summary", token);
    await authed("/api/dashboard/payments-overview", token);
    await authed("/api/audit-log?limit=100", token);
    await authed("/api/recovery-cases", token);
  }

  const later = await authed("/api/dashboard/summary", token).then((r) => r.json());
  assert.deepEqual(
    { rev: later.recoveredRevenue, cases: later.recoveredCases, total: later.totalCases },
    { rev: afterConfirm.recoveredRevenue, cases: afterConfirm.recoveredCases, total: afterConfirm.totalCases },
    "post-confirmation state is stable across refreshes — no silent re-seed"
  );

  const plan = (await authed("/api/recovery-plan/current", token).then((r) => r.json())).plan;
  assert.notEqual(plan.status, "PENDING_APPROVAL", "the executed plan was NOT reset back to pending by a refresh");
});

// ---- 5. Non-demo merchants are never reset and cannot seed ------------------------------

test("5: entering the demo never touches a non-demo merchant, which also cannot call seed", async () => {
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const { Merchant, Customer, Payment } = ctx.models;

  const real = await Merchant.create({ email: "real-co-demo-reset@test.payrevive.dev", name: "Real Co" });
  const realToken = signMerchantToken({ merchantId: real._id.toString(), isDemo: false }, { expiresIn: "1h" });

  // Give the real merchant some data of its own (a paid + a failed payment).
  const cust = await Customer.create({ merchantId: real._id, name: "Real Customer", email: "rc@real.example" });
  await Payment.create({ merchantId: real._id, customerId: cust._id, amount: 5000, currency: "INR", status: "paid" });
  await Payment.create({
    merchantId: real._id,
    customerId: cust._id,
    amount: 1200,
    currency: "INR",
    status: "failed",
    failureReason: "insufficient_funds",
  });

  // The real merchant cannot use the demo seed endpoint at all.
  const denied = await authed("/api/demo/seed", realToken, { method: "POST" });
  assert.equal(denied.status, 404);

  // Entering (and re-entering) the demo does not disturb the real merchant's data.
  await enterDemo();
  await enterDemo();

  assert.equal(await Customer.countDocuments({ merchantId: real._id }), 1);
  assert.equal(await Payment.countDocuments({ merchantId: real._id, status: "paid" }), 1);
  assert.equal(await Payment.countDocuments({ merchantId: real._id, status: "failed" }), 1);

  const realOverview = await authed("/api/dashboard/payments-overview", realToken).then((r) => r.json());
  assert.equal(realOverview.totalClients, 1);
  assert.equal(realOverview.paymentsPassed, 1);
  assert.equal(realOverview.paymentsFailed, 1);
});

// ---- 6. Re-entry is repeatable (three full cycles) --------------------------------------

test("6: enter -> execute -> re-enter, three times, always lands on fresh 100/90/10", async () => {
  for (let cycle = 1; cycle <= 3; cycle++) {
    const { token } = await enterDemo();

    const overview = await authed("/api/dashboard/payments-overview", token).then((r) => r.json());
    assert.equal(overview.totalClients, 100, `cycle ${cycle}: 100 clients`);
    assert.equal(overview.paymentsPassed, 90, `cycle ${cycle}: 90 passed`);
    assert.equal(overview.paymentsFailed, 10, `cycle ${cycle}: 10 failed`);

    const summary = await authed("/api/dashboard/summary", token).then((r) => r.json());
    assert.equal(summary.recoveredRevenue, 0, `cycle ${cycle}: starts with zero recovered revenue`);

    const plan = (await authed("/api/recovery-plan/current", token).then((r) => r.json())).plan;
    assert.equal(plan.status, "PENDING_APPROVAL", `cycle ${cycle}: fresh plan awaiting approval`);

    // Play the recovery through so the next cycle has to reset a dirty state.
    await authed(`/api/recovery-plan/${plan.id}/confirm`, token, { method: "POST" });
  }
});

// ---- 7. The audit explanation UI keeps its text-wrapping classes (no horizontal overflow) --

test("7: audit explanation text is set to wrap / break, not overflow its container", () => {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  const auditTrail = read("../client/src/pages/AuditTrail.jsx");
  const caseDetail = read("../client/src/pages/RecoveryCaseDetail.jsx");

  // AuditTrail: the free-text result (e.g. a DECISION_EXPLAINED rationale sentence) wraps,
  // the reason wraps, and the case-id link can break mid-string.
  assert.match(auditTrail, /break-words text-right font-mono text-xs text-slate-600/);
  assert.match(auditTrail, /<span className="min-w-0 break-words">\{humanize\(entry\.reason\)/);
  assert.match(auditTrail, /recovery-cases\/\$\{entry\.caseId\}`} className="break-all/);

  // RecoveryCaseDetail: the headline, the decision factors, the decision-trail reason, and
  // the audit-table reason/result cells all wrap; long codes/ids can break.
  assert.match(caseDetail, /className="break-words text-lg font-medium leading-snug/);
  assert.match(caseDetail, /<span className="min-w-0 break-words text-xs text-brand-500">\{f\.detail\}/);
  assert.match(caseDetail, /className="min-w-0 flex-1 pt-1"/);
  assert.match(caseDetail, /max-w-\[22rem\] break-words px-6 py-2\.5 align-top text-brand-500">\{entry\.reason/);
  assert.match(caseDetail, /max-w-\[16rem\] break-words px-6 py-2\.5 align-top text-brand-500">\{entry\.result/);
});

test("8: RecoveryCaseDetail — Evaluate errors truthfully and the Decision Trail is monotonic", () => {
  const src = readFileSync(fileURLToPath(new URL("../client/src/pages/RecoveryCaseDetail.jsx", import.meta.url)), "utf8");

  // Evaluate: a 5xx / transport failure gets the "waking up" message, not the raw string;
  // the case + trail are always re-synced afterwards (load() in finally).
  assert.match(src, /err\.status >= 500 \|\| !err\.status/);
  assert.match(src, /it may be waking up\. Please try again in a moment/);
  assert.match(src, /finally \{\s*\n\s*setBusy\(false\);\s*\n\s*load\(\);/);

  // Decision Trail: a step is "done" iff it or any later step has fired — never a lone
  // "Pending" row rendered below an already-executed one.
  assert.match(src, /const lastReachedStepIdx = TIMELINE_STEPS\.reduce/);
  assert.match(src, /const done = idx <= lastReachedStepIdx;/);
});
