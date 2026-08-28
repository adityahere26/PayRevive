// Agentic auto-recovery (server/src/pipeline/autoRecovery.js). This is the only test file that
// boots the app with AUTO_RECOVERY_ENABLED=true — the shared harness forces it off so the rest
// of the suite can assert the DETECT -> EVALUATE -> EXECUTE stages one step at a time. Fake
// rzp_test_ credentials are configured so the live payment-link path runs; the single outbound
// call it makes (the Razorpay Payment Links API) is intercepted by monkey-patching the global
// `fetch` used inside integrations/razorpay/client.js — every other URL (including this test's
// own calls to the app) goes to the real fetch untouched. No live network call is made.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startTestServer } from "./testUtils/testServer.js";

const FAKE_KEY_ID = "rzp_test_fake0000000001";
const FAKE_KEY_SECRET = "fake_test_secret_never_real";
const FAKE_WEBHOOK_SECRET = "fake_webhook_secret_never_real";

let ctx;

before(async () => {
  ctx = await startTestServer({
    envOverrides: {
      AUTO_RECOVERY_ENABLED: "true",
      RAZORPAY_KEY_ID: FAKE_KEY_ID,
      RAZORPAY_KEY_SECRET: FAKE_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    },
  });
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, AuditLog, WebhookEvent } = ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
    RecoveryAction.deleteMany({}),
    AuditLog.deleteMany({}),
    WebhookEvent.deleteMany({}),
  ]);
});

// ---- fetch interception: only Razorpay-bound calls are mocked ------------------------------

let razorpayCallLog = [];
let razorpayHandler = null;
let originalFetch = null;

before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (typeof url === "string" && url.startsWith("https://api.razorpay.com/")) {
      razorpayCallLog.push({ url, opts });
      if (!razorpayHandler) throw new Error("Unexpected Razorpay call — no handler installed for this test");
      return razorpayHandler(url, opts);
    }
    return originalFetch(url, opts);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  razorpayCallLog = [];
  razorpayHandler = null;
});

function fakeResponse(status, bodyObj) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(bodyObj) };
}

function successfulLinkResponse({ id = "plink_fake000000000001", amount, referenceId } = {}) {
  return fakeResponse(200, {
    id,
    short_url: `https://rzp.io/i/${id}`,
    status: "created",
    reference_id: referenceId,
    amount,
    currency: "INR",
  });
}

function linkSuccessHandler() {
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };
}

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

async function reportFailure(token, overrides = {}) {
  return authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload(overrides)),
  }).then((r) => r.json());
}

// Seeds N prior *paid* payments for a customer so the Scoring Engine's success ratio pushes the
// recovery probability into the >=0.75 band where the Intervention Selector picks voice (with
// voiceEnabled true).
async function seedTrustedCustomer(merchantId, email) {
  const { Customer, Payment } = ctx.models;
  const customer = await Customer.create({ merchantId, name: "Loyal Customer", email: email.toLowerCase(), optedOut: false });
  await Payment.create(
    Array.from({ length: 6 }, () => ({
      merchantId,
      customerId: customer._id,
      amount: 1999,
      currency: "INR",
      status: "paid",
    }))
  );
  return customer;
}

// ---- 1. an eligible failed payment is automatically taken through the policy-approved action --

test("1: a new eligible failed payment is automatically evaluated AND actioned — no per-case click", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, { amount: 2999 });

  assert.equal(body.autoRecovery.active, true);
  assert.equal(body.autoRecovery.decision, "PAYMENT_LINK_SENT");
  assert.equal(body.recoveryCase.status, "WAITING_OUTCOME");
  assert.equal(body.recoveryCase.selectedIntervention, "CREATE_PAYMENT_LINK");
  assert.equal(body.recoveryCase.policyDecision, "APPROVED");
  assert.equal(body.recoveryCase.recoveredAmount, 0); // link created != revenue recovered
  assert.equal(razorpayCallLog.length, 1);

  const { AuditLog } = ctx.models;
  const types = (await AuditLog.find({ caseId: body.recoveryCase._id }).sort({ timestamp: 1 })).map((e) => e.eventType);
  for (const expected of [
    "REVENUE_RISK_DETECTED",
    "ROOT_CAUSE_IDENTIFIED",
    "ELIGIBILITY_EVALUATED",
    "RECOVERY_SCORED",
    "INTERVENTION_SELECTED",
    "POLICY_EVALUATED",
    "PAYMENT_LINK_CREATED",
    "AUTO_RECOVERY_EXECUTED",
  ]) {
    assert.ok(types.includes(expected), `audit trail missing ${expected} — got ${types.join(", ")}`);
  }
});

// ---- 2. the payment-link case auto-invokes the existing live/test executor -------------------

test("2: automatic CREATE_PAYMENT_LINK goes through the same live Razorpay Test Mode executor as the manual route", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, { amount: 2999 });

  assert.equal(razorpayCallLog.length, 1);
  assert.ok(razorpayCallLog[0].url.endsWith("/payment_links"));
  const sent = JSON.parse(razorpayCallLog[0].opts.body);
  assert.equal(sent.amount, 299900); // rupees -> paise, the case's own stored amount
  assert.equal(sent.reference_id, body.recoveryCase._id);

  const { RecoveryAction } = ctx.models;
  const actions = await RecoveryAction.find({ caseId: body.recoveryCase._id });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].actionType, "CREATE_PAYMENT_LINK");
  assert.equal(actions[0].status, "LIVE_TEST_MODE");
  assert.equal(actions[0].metadata.autonomous, true);
});

// ---- 3. a high-probability case with voice enabled is auto-queued for the voice flow --------

test("3: when policy selects START_VOICE_RECOVERY the agent queues it for a live session, never fabricates a call", async () => {
  const { token, merchant } = await demoToken();
  const email = `loyal-${Date.now()}@example.com`;
  await seedTrustedCustomer(merchant.id, email);

  const body = await reportFailure(token, {
    customer: { name: "Loyal Customer", email },
    amount: 2999,
    failureReason: "insufficient_funds",
  });

  assert.equal(body.recoveryCase.selectedIntervention, "START_VOICE_RECOVERY");
  assert.equal(body.recoveryCase.status, "POLICY_APPROVED"); // approved for voice, awaiting the live session
  assert.equal(body.autoRecovery.decision, "VOICE_QUEUED");
  assert.equal(body.recoveryCase.voiceAttempts, 0); // only routes/voice.js increments this
  assert.equal(razorpayCallLog.length, 0);

  const { AuditLog } = ctx.models;
  assert.ok(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "AUTO_RECOVERY_VOICE_QUEUED" }));
});

// ---- 4. a high-value case never auto-executes ----------------------------------------------

test("4: a high-value case (above the autonomous ceiling) is escalated, never auto-actioned", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, { amount: 75000 });

  assert.equal(body.recoveryCase.status, "ESCALATED");
  assert.equal(body.recoveryCase.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");
  assert.equal(body.autoRecovery.decision, "ESCALATED");
  assert.equal(body.recoveryCase.recoveredAmount, 0);
  assert.equal(razorpayCallLog.length, 0);

  const { AuditLog } = ctx.models;
  assert.ok(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "AUTO_RECOVERY_NO_ACTION" }));
});

// ---- 5. an opted-out customer never auto-executes ----------------------------------------

test("5: an opted-out customer's failed payment is stopped, never auto-contacted", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, {
    customer: { name: "Refuses Contact", email: `optout-${Date.now()}@example.com`, optedOut: true },
  });

  assert.equal(body.recoveryCase.status, "STOPPED");
  assert.equal(body.recoveryCase.policyDecision, "OPT_OUT_BEHAVIOR");
  assert.equal(body.autoRecovery.decision, "STOPPED");
  assert.equal(razorpayCallLog.length, 0);
});

// ---- 6. a case that has exhausted its recovery attempts never auto-executes ----------------

test("6: an attempts-exhausted case is stopped by policy, never auto-actioned", async () => {
  const { token, merchant } = await demoToken();
  const { Merchant, Customer, RecoveryCase } = ctx.models;
  const { runAutomaticRecovery } = await import("../server/src/pipeline/autoRecovery.js");

  const merchantDoc = await Merchant.findById(merchant.id);
  const customer = await Customer.create({ merchantId: merchant.id, name: "Exhausted", optedOut: false });
  const recoveryCase = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    currency: "INR",
    status: "RISK_DETECTED",
    attempts: 2, // == default maxRecoveryAttempts
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });

  const result = await runAutomaticRecovery({ recoveryCase, merchant: merchantDoc, customer, payment: null });

  assert.equal(result.recoveryCase.status, "STOPPED");
  assert.equal(result.recoveryCase.policyDecision, "RETRY_LIMIT_REACHED");
  assert.equal(result.executed, null);
  assert.equal(razorpayCallLog.length, 0);
});

// ---- 7. a case whose recovery window has expired never auto-executes -----------------------

test("7: an expired-window case resolves to EXPIRED, never auto-actioned", async () => {
  const { token, merchant } = await demoToken();
  const { Merchant, Customer, RecoveryCase } = ctx.models;
  const { runAutomaticRecovery } = await import("../server/src/pipeline/autoRecovery.js");

  const merchantDoc = await Merchant.findById(merchant.id);
  const customer = await Customer.create({ merchantId: merchant.id, name: "Too Late", optedOut: false });
  const recoveryCase = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    currency: "INR",
    status: "RISK_DETECTED",
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
    recoveryWindowExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // already expired
  });

  const result = await runAutomaticRecovery({ recoveryCase, merchant: merchantDoc, customer, payment: null });

  assert.equal(result.recoveryCase.status, "EXPIRED");
  assert.equal(result.recoveryCase.policyDecision, "RECOVERY_WINDOW_EXPIRED");
  assert.equal(razorpayCallLog.length, 0);
});

// ---- 8. concurrent automatic triggers stay idempotent -------------------------------------

test("8: two concurrent auto-recovery runs on one case create exactly one payment link", async () => {
  const { merchant } = await demoToken();
  const { Merchant, Customer, RecoveryCase, RecoveryAction, AuditLog } = ctx.models;
  const { runAutomaticRecovery } = await import("../server/src/pipeline/autoRecovery.js");
  razorpayHandler = linkSuccessHandler();

  const merchantDoc = await Merchant.findById(merchant.id);
  const customer = await Customer.create({ merchantId: merchant.id, name: "Race", email: `race-${Date.now()}@example.com`, optedOut: false });
  const seed = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    currency: "INR",
    status: "RISK_DETECTED",
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });

  const [a, b] = await Promise.all([RecoveryCase.findById(seed._id), RecoveryCase.findById(seed._id)]);
  await Promise.all([
    runAutomaticRecovery({ recoveryCase: a, merchant: merchantDoc, customer, payment: null }),
    runAutomaticRecovery({ recoveryCase: b, merchant: merchantDoc, customer, payment: null }),
  ]);

  assert.equal(razorpayCallLog.length, 1);
  const fresh = await RecoveryCase.findById(seed._id);
  assert.equal(fresh.status, "WAITING_OUTCOME");
  assert.equal(fresh.attempts, 1);

  const linkActions = await RecoveryAction.find({ caseId: seed._id, actionType: "CREATE_PAYMENT_LINK" });
  assert.equal(linkActions.length, 1);
  const created = await AuditLog.find({ caseId: seed._id, eventType: "PAYMENT_LINK_CREATED" });
  assert.equal(created.length, 1);
});

// ---- 9. a failed automatic execution stays retryable, never falsely recovered --------------

test("9: a Razorpay failure during auto-recovery leaves the case POLICY_APPROVED and retryable", async () => {
  const { token } = await demoToken();
  razorpayHandler = async () => fakeResponse(500, { error: { description: "Internal error" } });

  const body = await reportFailure(token, { amount: 2999 });

  assert.equal(body.recoveryCase.status, "POLICY_APPROVED");
  assert.equal(body.autoRecovery.decision, "EXECUTION_FAILED");

  const { RecoveryCase, AuditLog } = ctx.models;
  const fresh = await RecoveryCase.findById(body.recoveryCase._id);
  assert.equal(fresh.status, "POLICY_APPROVED");
  assert.equal(fresh.razorpayPaymentLinkId, null);
  assert.equal(fresh.razorpayLinkClaimedAt, null); // claim released, not stuck
  assert.equal(fresh.recoveredAmount, 0);
  assert.ok(await AuditLog.exists({ caseId: fresh._id, eventType: "PAYMENT_LINK_CREATION_FAILED" }));

  // ...and a subsequent (manual) retry can still succeed.
  razorpayHandler = linkSuccessHandler();
  const retry = await authedFetch(`/api/recovery-cases/${fresh._id}/payment-link`, token, { method: "POST" });
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).recoveryCase.status, "WAITING_OUTCOME");
});

// ---- 10. only a verified webhook credits recovered revenue --------------------------------

test("10: auto-created link does NOT credit revenue — only the verified payment_link.paid webhook does", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, { amount: 2999 });
  assert.equal(body.recoveryCase.status, "WAITING_OUTCOME");

  const midSummary = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(midSummary.recoveredRevenue, 0);

  const { RecoveryCase } = ctx.models;
  const withLink = await RecoveryCase.findById(body.recoveryCase._id);
  const rawBody = JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: {
        entity: { id: withLink.razorpayPaymentLinkId, reference_id: String(withLink._id), status: "paid", amount: 299900, currency: "INR" },
      },
    },
  });
  const signature = crypto.createHmac("sha256", FAKE_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const hookRes = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": crypto.randomUUID() },
    body: rawBody,
  });
  assert.equal(hookRes.status, 200);

  const recovered = await RecoveryCase.findById(withLink._id);
  assert.equal(recovered.status, "RECOVERED");
  assert.equal(recovered.recoveredAmount, 2999);

  const finalSummary = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(finalSummary.recoveredRevenue, 2999);
});

// ---- 11. auto-recovery + a manual click never double-create a link -----------------------

test("11: a manual payment-link click after auto-recovery reuses the auto-created link (no duplicate)", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, { amount: 2999 });
  assert.equal(razorpayCallLog.length, 1);

  const manual = await authedFetch(`/api/recovery-cases/${body.recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(manual.status, 200);
  const manualBody = await manual.json();
  assert.equal(manualBody.reused, true);
  assert.equal(razorpayCallLog.length, 1); // still only one Razorpay call, ever

  const { RecoveryAction } = ctx.models;
  const links = await RecoveryAction.find({ caseId: body.recoveryCase._id, actionType: "CREATE_PAYMENT_LINK" });
  assert.equal(links.length, 1);
});

// ---- 12. re-running auto-recovery on a voice-queued case never adds a voice attempt --------

test("12: a second auto-recovery pass on a voice-queued case does not add a voice attempt or a duplicate queue event", async () => {
  const { token, merchant } = await demoToken();
  const { Merchant, Customer, RecoveryCase, AuditLog } = ctx.models;
  const { runAutomaticRecovery } = await import("../server/src/pipeline/autoRecovery.js");

  const email = `loyal2-${Date.now()}@example.com`;
  const customer = await seedTrustedCustomer(merchant.id, email);
  const merchantDoc = await Merchant.findById(merchant.id);

  const created = await reportFailure(token, { customer: { name: "Loyal Customer", email }, amount: 2999 });
  assert.equal(created.recoveryCase.selectedIntervention, "START_VOICE_RECOVERY");

  const again = await RecoveryCase.findById(created.recoveryCase._id);
  await runAutomaticRecovery({ recoveryCase: again, merchant: merchantDoc, customer, payment: null });

  const fresh = await RecoveryCase.findById(created.recoveryCase._id);
  assert.equal(fresh.voiceAttempts, 0);
  const queued = await AuditLog.find({ caseId: fresh._id, eventType: "AUTO_RECOVERY_VOICE_QUEUED" });
  assert.equal(queued.length, 1);
});

// ---- 13. merchant isolation is intact for everything auto-recovery writes -----------------

test("13: auto-recovery writes only merchant-scoped rows; another merchant sees none of it", async () => {
  const { token, merchant } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const body = await reportFailure(token, { amount: 2999 });

  const { AuditLog, RecoveryAction, Merchant } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");

  for (const row of await AuditLog.find({ caseId: body.recoveryCase._id })) {
    assert.equal(String(row.merchantId), String(merchant.id));
  }
  for (const row of await RecoveryAction.find({ caseId: body.recoveryCase._id })) {
    assert.equal(String(row.merchantId), String(merchant.id));
  }

  const merchantB = await Merchant.create({ email: "merchant-b-auto@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });
  const overviewB = await authedFetch("/api/dashboard/payments-overview", tokenB).then((r) => r.json());
  assert.equal(overviewB.paymentsFailed, 0);
  assert.equal(overviewB.failedPayments.length, 0);
});
