// FINAL BUILDATHON RECOVERY DEMO — measured, end-to-end recovery over the 100-client demo
// batch:  seed 100/90/10  →  plan (PENDING_APPROVAL)  →  one merchant confirmation  →  real
// Razorpay Test Mode payment links  →  signed payment_link.paid webhook to the REAL webhook
// route  →  RecoveryCase RECOVERED  →  recoveredAmount credited  →  dashboard updates.
//
// Fake rzp_test_ credentials + webhook secret are configured; the one outbound call the
// confirm step makes (the Razorpay Payment Links API) is intercepted, everything else — the
// demo helper's self-POST to /api/webhooks/razorpay — passes through to the real server.
// Nothing marks a case RECOVERED except the verified webhook.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startTestServer } from "./testUtils/testServer.js";

const FAKE_KEY_ID = "rzp_test_fake0000000001";
const FAKE_KEY_SECRET = "fake_test_secret_never_real";
const FAKE_WEBHOOK_SECRET = "fake_webhook_secret_never_real";

let ctx;
let seedDemoDataset;

before(async () => {
  ctx = await startTestServer({
    envOverrides: {
      RAZORPAY_KEY_ID: FAKE_KEY_ID,
      RAZORPAY_KEY_SECRET: FAKE_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    },
  });
  ({ seedDemoDataset } = await import("../server/src/services/demoSeed.js"));
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, RecoveryPlan, AuditLog, WebhookEvent } = ctx.models;
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

// ---- Razorpay fetch interception (self-POST to the local webhook route passes through) -----

let razorpayCallLog = [];
let originalFetch = null;

before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (typeof url === "string" && url.startsWith("https://api.razorpay.com/")) {
      razorpayCallLog.push({ url, opts });
      const body = JSON.parse(opts.body);
      // Unique link id per case (derived from reference_id = caseId).
      const id = `plink_${String(body.reference_id).slice(-12)}`;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id,
            short_url: `https://rzp.io/i/${id}`,
            status: "created",
            reference_id: body.reference_id,
            amount: body.amount,
            currency: "INR",
          }),
      };
    }
    return originalFetch(url, opts);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  razorpayCallLog = [];
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

function paymentLinkPaidBody(recoveryCase, { amountPaise } = {}) {
  const paise = amountPaise ?? recoveryCase.amount * 100;
  return JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: {
        entity: {
          id: recoveryCase.razorpayPaymentLinkId,
          reference_id: String(recoveryCase._id),
          status: "paid",
          amount: paise,
          amount_paid: paise,
          currency: recoveryCase.currency || "INR",
        },
      },
    },
  });
}
function sign(body) {
  return crypto.createHmac("sha256", FAKE_WEBHOOK_SECRET).update(body).digest("hex");
}

// Seed → confirm the plan; returns { token, merchant, plan, linkCases }.
async function seedAndConfirm() {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });

  const planRes = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());
  const confirmRes = await authedFetch(`/api/recovery-plan/${planRes.plan.id}/confirm`, token, { method: "POST" });
  assert.equal(confirmRes.status, 200);
  const confirmed = (await confirmRes.json()).plan;

  const { RecoveryCase } = ctx.models;
  const linkCases = await RecoveryCase.find({ merchantId: merchant.id, status: "WAITING_OUTCOME" });
  return { token, merchant, plan: confirmed, linkCases };
}

// ---- 1. seeded 100/90/10 --------------------------------------------------------------------

test("1: seed produces 100 clients / 90 passed / 10 failed, all persisted", async () => {
  const { token, merchant } = await demoToken();
  const summary = await seedDemoDataset({ merchantId: merchant.id });
  assert.deepEqual(
    [summary.totalClients, summary.paymentsPassed, summary.paymentsFailed],
    [100, 90, 10]
  );
  const overview = await authedFetch("/api/dashboard/payments-overview", token).then((r) => r.json());
  assert.equal(overview.totalClients, 100);
  assert.equal(overview.paymentsPassed, 90);
  assert.equal(overview.paymentsFailed, 10);
  assert.equal(overview.failedPayments.length, 10);
});

// ---- 2. plan pending approval, nothing executed ------------------------------------------

test("2: after seeding the recovery plan is PENDING_APPROVAL with nothing executed", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });
  const planRes = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());
  assert.equal(planRes.plan.status, "PENDING_APPROVAL");
  assert.equal(planRes.plan.summary.executed, 0);
  assert.ok(planRes.plan.summary.recoverable >= 1);
});

// ---- 3. no payment link created before confirmation ------------------------------------

test("3: no Razorpay call, no payment link, no recovered revenue before confirmation", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });
  const { RecoveryCase, AuditLog } = ctx.models;

  assert.equal(razorpayCallLog.length, 0);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchant.id, razorpayPaymentLinkId: { $ne: null } }), 0);
  assert.equal(await AuditLog.countDocuments({ merchantId: merchant.id, eventType: "PAYMENT_LINK_CREATED" }), 0);

  const s = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(s.recoveredRevenue, 0);
  assert.equal(s.recoveredCases, 0);
});

// ---- 4. confirmation creates the approved payment links (Test Mode), still 0 recovered ----

test("4: one confirmation creates every approved payment link via Razorpay Test Mode; recoveredAmount stays 0", async () => {
  const { token, merchant, linkCases } = await seedAndConfirm();
  const { AuditLog } = ctx.models;

  assert.ok(linkCases.length >= 1, "at least one payment-link recovery reached Razorpay Test Mode");
  assert.equal(razorpayCallLog.length, linkCases.length, "exactly one Razorpay call per link case");
  for (const rc of linkCases) {
    assert.equal(rc.status, "WAITING_OUTCOME");
    assert.ok(rc.razorpayPaymentLinkId, "payment link id persisted");
    assert.ok(rc.razorpayPaymentLinkShortUrl, "short url persisted");
    assert.equal(rc.recoveredAmount, 0, "link created is NOT recovered");
  }
  assert.equal(
    await AuditLog.countDocuments({ merchantId: merchant.id, eventType: "PAYMENT_LINK_CREATED" }),
    linkCases.length
  );
  const s = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(s.recoveredRevenue, 0);
});

// ---- 5. duplicate confirmation is idempotent -----------------------------------------

test("5: a second confirmation creates no further links and does not change the plan", async () => {
  const { token, merchant } = await demoToken();
  await seedDemoDataset({ merchantId: merchant.id });
  const planRes = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());

  const first = await authedFetch(`/api/recovery-plan/${planRes.plan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  const callsAfterFirst = razorpayCallLog.length;
  assert.ok(callsAfterFirst >= 1);

  const second = await authedFetch(`/api/recovery-plan/${planRes.plan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  assert.equal(second.idempotent, true);
  assert.equal(second.plan.status, first.plan.status);
  assert.equal(razorpayCallLog.length, callsAfterFirst, "no extra Razorpay calls on re-confirm");

  const { AuditLog } = ctx.models;
  assert.equal(
    await AuditLog.countDocuments({ merchantId: merchant.id, eventType: "PAYMENT_LINK_CREATED" }),
    callsAfterFirst
  );
});

// ---- 6. a verified webhook is the ONLY thing that marks a case RECOVERED -----------------

test("6: completing the Test Mode payment (signed webhook to the real route) marks cases RECOVERED", async () => {
  const { token, merchant, linkCases } = await seedAndConfirm();

  const before = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(before.recoveredRevenue, 0);

  const res = await authedFetch("/api/demo/complete-test-payment", token, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.completed.length, linkCases.length);
  for (const c of body.completed) {
    assert.equal(c.webhookHttpStatus, 200);
    assert.equal(c.webhookStatus, "PROCESSED");
    assert.equal(c.caseStatus, "RECOVERED");
    assert.equal(c.recoveredAmount, c.amount);
  }

  const { RecoveryCase } = ctx.models;
  for (const rc of linkCases) {
    const fresh = await RecoveryCase.findById(rc._id);
    assert.equal(fresh.status, "RECOVERED");
  }

  // idempotent: a second completion re-delivers the same event ids → ALREADY_PROCESSED, no double credit
  const again = await authedFetch("/api/demo/complete-test-payment", token, { method: "POST" });
  assert.equal((await again.json()).completed.length, 0, "no WAITING_OUTCOME cases remain to complete");
});

// ---- 7. recoveredAmount equals the actual successful payment amount ---------------------

test("7: recoveredAmount for each case equals its own failed Payment amount — nothing hardcoded", async () => {
  const { token, merchant, linkCases } = await seedAndConfirm();
  await authedFetch("/api/demo/complete-test-payment", token, { method: "POST" });

  const { RecoveryCase, Payment } = ctx.models;
  let expectedTotal = 0;
  for (const rc of linkCases) {
    const fresh = await RecoveryCase.findById(rc._id);
    const payment = await Payment.findById(fresh.paymentId);
    assert.equal(fresh.recoveredAmount, payment.amount);
    assert.equal(fresh.recoveredAmount, fresh.amount);
    expectedTotal += payment.amount;
  }

  const s = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(s.recoveredRevenue, expectedTotal);
  assert.equal(s.recoveredCases, linkCases.length);
});

// ---- 8. an invalid / mismatched webhook can NOT mark a case recovered ------------------

test("8: a bad-signature or amount-mismatch webhook never credits recoveredAmount", async () => {
  const { token, merchant, linkCases } = await seedAndConfirm();
  const { RecoveryCase, AuditLog } = ctx.models;
  const target = linkCases[0];

  // bad signature
  const bad = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": "0".repeat(64),
      "x-razorpay-event-id": crypto.randomUUID(),
    },
    body: paymentLinkPaidBody(target),
  });
  assert.equal(bad.status, 400);

  // valid signature, wrong amount
  const wrongAmountBody = paymentLinkPaidBody(target, { amountPaise: (target.amount + 5000) * 100 });
  const mismatch = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": sign(wrongAmountBody),
      "x-razorpay-event-id": crypto.randomUUID(),
    },
    body: wrongAmountBody,
  });
  assert.equal(mismatch.status, 200); // acked, but not applied

  const fresh = await RecoveryCase.findById(target._id);
  assert.equal(fresh.status, "WAITING_OUTCOME");
  assert.equal(fresh.recoveredAmount, 0);
  assert.ok(await AuditLog.exists({ caseId: target._id, eventType: "RAZORPAY_WEBHOOK_REJECTED" }));
  assert.ok(!(await AuditLog.exists({ caseId: target._id, eventType: "PAYMENT_RECOVERY_SUCCEEDED" })));

  const s = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(s.recoveredRevenue, 0);
});

// ---- 9. dashboard recovered revenue moves from ₹0 to a DB-derived amount ---------------

test("9: dashboard Recovered Revenue goes 0 → measured amount, entirely from persisted data", async () => {
  const { token, linkCases } = await seedAndConfirm();

  const mid = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(mid.recoveredRevenue, 0);

  await authedFetch("/api/demo/complete-test-payment", token, { method: "POST" });

  const after = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.ok(after.recoveredRevenue > 0);
  assert.equal(after.recoveredCases, linkCases.length);
  assert.equal(after.statusBreakdown.RECOVERED, linkCases.length);
  // revenue-at-risk still reflects all 10 failed cases (unchanged aggregation)
  assert.equal(after.totalCases, 10);
});

// ---- 10. the recovery audit chain reflects real events --------------------------------

test("10: the recovered case's audit trail is the real approval-gated recovery chain", async () => {
  const { token, linkCases } = await seedAndConfirm();
  await authedFetch("/api/demo/complete-test-payment", token, { method: "POST" });

  const target = linkCases[0];
  const trail = await authedFetch(`/api/recovery-cases/${target._id}/audit`, token).then((r) => r.json());
  const seq = trail.auditLog.map((e) => e.eventType);

  for (const ev of [
    "REVENUE_RISK_DETECTED",
    "RECOVERY_PLAN_CREATED",
    "RECOVERY_PLAN_APPROVED",
    "PAYMENT_LINK_CREATED",
    "RECOVERY_EXECUTED",
    "RAZORPAY_WEBHOOK_VERIFIED",
    "PAYMENT_RECOVERY_SUCCEEDED",
  ]) {
    assert.ok(seq.includes(ev), `audit chain missing ${ev} — got ${seq.join(", ")}`);
  }
  // ordering: risk detected first, recovery succeeded last
  assert.ok(seq.indexOf("REVENUE_RISK_DETECTED") < seq.indexOf("PAYMENT_LINK_CREATED"));
  assert.ok(seq.indexOf("PAYMENT_LINK_CREATED") < seq.indexOf("PAYMENT_RECOVERY_SUCCEEDED"));
  assert.ok(seq.indexOf("RAZORPAY_WEBHOOK_VERIFIED") < seq.indexOf("PAYMENT_RECOVERY_SUCCEEDED"));

  const approved = trail.auditLog.find((e) => e.eventType === "RECOVERY_PLAN_APPROVED");
  assert.equal(approved.actor, "MERCHANT");
});

// ---- 11. merchant isolation --------------------------------------------------------------

test("11: another merchant can neither confirm nor complete this merchant's recovery", async () => {
  const { token: tokenA, merchant: demoMerchant, linkCases } = await seedAndConfirm();
  await authedFetch("/api/demo/complete-test-payment", tokenA, { method: "POST" });
  const recoveredTotalA = (await authedFetch("/api/dashboard/summary", tokenA).then((r) => r.json())).recoveredRevenue;
  assert.ok(recoveredTotalA > 0);

  const { Merchant } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const merchantB = await Merchant.create({ email: "merchant-b-recovery-pass@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  // B cannot see or confirm A's plan
  const planA = await authedFetch("/api/recovery-plan/current", tokenA).then((r) => r.json());
  const confB = await authedFetch(`/api/recovery-plan/${planA.plan.id}/confirm`, tokenB, { method: "POST" });
  assert.equal(confB.status, 404);

  // B's complete-test-payment finds nothing of A's
  const compB = await authedFetch("/api/demo/complete-test-payment", tokenB, { method: "POST" });
  assert.equal((await compB.json()).completed.length, 0);

  // A's measured recovery is untouched
  const stillA = await authedFetch("/api/dashboard/summary", tokenA).then((r) => r.json());
  assert.equal(stillA.recoveredRevenue, recoveredTotalA);
  assert.equal(stillA.recoveredCases, linkCases.length);
});

// ---- 12. deterministic seed --------------------------------------------------------------

test("12: re-seeding reproduces the identical deterministic scenario", async () => {
  const { merchant } = await demoToken();
  const a = await seedDemoDataset({ merchantId: merchant.id });
  const b = await seedDemoDataset({ merchantId: merchant.id });
  const { Customer } = ctx.models;
  assert.equal(await Customer.countDocuments({ merchantId: merchant.id }), 100);
  assert.deepEqual(
    a.outcomes.map((o) => [o.customerIndex, o.failureReason, o.amount, o.status, o.selectedIntervention]),
    b.outcomes.map((o) => [o.customerIndex, o.failureReason, o.amount, o.status, o.selectedIntervention])
  );
});

// ---- auth guard on the demo helper ---------------------------------------------------

test("POST /api/demo/complete-test-payment requires authentication", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/demo/complete-test-payment`, { method: "POST" });
  assert.equal(res.status, 401);
});
