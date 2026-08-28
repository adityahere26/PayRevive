// Approval-gated autonomy (server/src/pipeline/recoveryPlan.js). Boots the app with
// RECOVERY_AUTOPLAN_ENABLED=true (the shared harness forces it off so the rest of the suite can
// step through the pipeline manually). Fake rzp_test_ credentials are configured so the
// post-confirmation payment-link path runs; the one outbound call it makes (the Razorpay
// Payment Links API) is intercepted by monkey-patching global fetch. Telephony makes no network
// call by construction (no provider wired up), so there is nothing to mock there — the absence
// of VOICE_RECOVERY_STARTED audit / RecoveryAction / voiceAttempts proves no call was placed.

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
      RECOVERY_AUTOPLAN_ENABLED: "true",
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

// ---- Razorpay fetch interception ---------------------------------------------------------

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

// Seeds prior paid payments so the score lands in the >=0.75 band → voice is selected.
async function seedTrustedCustomer(merchantId, email) {
  const { Customer, Payment } = ctx.models;
  const customer = await Customer.create({ merchantId, name: "Loyal Customer", email: email.toLowerCase(), optedOut: false });
  await Payment.create(
    Array.from({ length: 6 }, () => ({ merchantId, customerId: customer._id, amount: 1999, currency: "INR", status: "paid" }))
  );
  return customer;
}

function signBody(bodyString) {
  return crypto.createHmac("sha256", FAKE_WEBHOOK_SECRET).update(bodyString).digest("hex");
}

// ---- 1. a failed payment creates a recovery plan (no customer contact) -------------------

test("1: a failed payment autonomously creates a PENDING_APPROVAL recovery plan and contacts nobody", async () => {
  const { token } = await demoToken();
  const body = await reportFailure(token, { amount: 2999 });

  assert.ok(body.recoveryPlan, "response carries the prepared plan");
  assert.equal(body.recoveryPlan.status, "PENDING_APPROVAL");
  assert.equal(body.recoveryPlan.items.length, 1);
  assert.equal(body.recoveryPlan.items[0].status, "PENDING");
  assert.equal(String(body.recoveryPlan.items[0].caseId), String(body.recoveryCase._id));
  assert.equal(razorpayCallLog.length, 0);

  const { AuditLog } = ctx.models;
  assert.ok(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "RECOVERY_PLAN_CREATED" }));
  assert.ok(!(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "RECOVERY_EXECUTED" })));

  const current = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());
  assert.equal(String(current.plan.id), String(body.recoveryPlan.id));
});

// ---- 2. the plan contains the policy engine's actual decisions --------------------------

test("2: the plan mirrors the policy engine's decisions — link (approval-gated), escalate, stop", async () => {
  const { token } = await demoToken();
  await reportFailure(token, { amount: 2999, failureReason: "insufficient_funds" });
  await reportFailure(token, { amount: 75000 }); // high value -> escalate
  await reportFailure(token, {
    customer: { name: "No Contact", email: `optout-${Date.now()}@example.com`, optedOut: true },
  });

  const { plan } = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());
  const byIntervention = plan.summary.byIntervention;
  assert.equal(byIntervention.CREATE_PAYMENT_LINK, 1);
  assert.equal(byIntervention.ESCALATE, 1);
  assert.equal(byIntervention.STOP, 1);

  const link = plan.items.find((i) => i.intervention === "CREATE_PAYMENT_LINK");
  assert.equal(link.customerFacing, true);
  assert.equal(link.requiresMerchantApproval, true);
  const esc = plan.items.find((i) => i.intervention === "ESCALATE");
  assert.equal(esc.customerFacing, false);
  assert.equal(esc.requiresMerchantApproval, false);
  assert.equal(plan.summary.recoverable, 1); // only the payment-link item is customer-facing here
});

// ---- 3. no voice call is placed before confirmation ------------------------------------

test("3: a voice decision is recorded in the plan but NO call is placed before confirmation", async () => {
  const { token, merchant } = await demoToken();
  const email = `loyal-${Date.now()}@example.com`;
  await seedTrustedCustomer(merchant.id, email);

  const body = await reportFailure(token, { customer: { name: "Loyal Customer", email }, amount: 2999 });
  const item = body.recoveryPlan.items[0];
  assert.equal(item.intervention, "START_VOICE_RECOVERY");
  assert.equal(item.customerFacing, true);
  assert.equal(item.status, "PENDING");

  const { AuditLog, RecoveryAction, RecoveryCase } = ctx.models;
  assert.ok(!(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "VOICE_RECOVERY_STARTED" })));
  assert.equal(await RecoveryAction.countDocuments({ caseId: body.recoveryCase._id }), 0);
  assert.equal((await RecoveryCase.findById(body.recoveryCase._id)).voiceAttempts, 0);
});

// ---- 4. no payment link is created before confirmation --------------------------------

test("4: a payment-link decision does NOT hit Razorpay before confirmation", async () => {
  const { token } = await demoToken();
  const body = await reportFailure(token, { amount: 2999 });

  assert.equal(body.recoveryPlan.items[0].intervention, "CREATE_PAYMENT_LINK");
  assert.equal(razorpayCallLog.length, 0);

  const { RecoveryCase, AuditLog } = ctx.models;
  const fresh = await RecoveryCase.findById(body.recoveryCase._id);
  assert.equal(fresh.status, "POLICY_APPROVED");
  assert.equal(fresh.razorpayPaymentLinkId, null);
  assert.ok(!(await AuditLog.exists({ caseId: fresh._id, eventType: "PAYMENT_LINK_CREATED" })));
});

// ---- 5. confirming the plan executes every approved action ---------------------------

test("5: confirming the plan creates the payment link AND initiates the voice call", async () => {
  const { token, merchant } = await demoToken();
  razorpayHandler = linkSuccessHandler();

  const linkCase = (await reportFailure(token, { amount: 2999 })).recoveryCase;
  const voiceEmail = `loyal-${Date.now()}@example.com`;
  await seedTrustedCustomer(merchant.id, voiceEmail);
  const voiceCase = (await reportFailure(token, { customer: { name: "Loyal Customer", email: voiceEmail }, amount: 2999 })).recoveryCase;

  const { plan } = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());
  const confirmRes = await authedFetch(`/api/recovery-plan/${plan.id}/confirm`, token, { method: "POST" });
  assert.equal(confirmRes.status, 200);
  const confirmed = (await confirmRes.json()).plan;

  assert.equal(confirmed.status, "COMPLETED");
  for (const item of confirmed.items) assert.equal(item.status, "EXECUTED");
  assert.equal(razorpayCallLog.length, 1);

  const { RecoveryCase, RecoveryAction, AuditLog } = ctx.models;
  assert.equal((await RecoveryCase.findById(linkCase._id)).status, "WAITING_OUTCOME");
  assert.equal((await RecoveryCase.findById(voiceCase._id)).voiceAttempts, 1);
  assert.ok(await RecoveryAction.exists({ caseId: voiceCase._id, actionType: "START_VOICE_RECOVERY", status: "INITIATED" }));

  const types = (await AuditLog.find({ merchantId: merchant.id })).map((e) => `${e.actor}:${e.eventType}`);
  assert.ok(types.includes("MERCHANT:RECOVERY_PLAN_APPROVED"));
  assert.ok(types.includes("SYSTEM:PAYMENT_LINK_CREATED"));
  assert.ok(types.includes("SYSTEM:VOICE_RECOVERY_STARTED"));
  assert.ok(types.includes("SYSTEM:RECOVERY_EXECUTED"));
  assert.ok(types.includes("SYSTEM:RECOVERY_PLAN_EXECUTED"));
});

// ---- 6. duplicate confirmation is idempotent ---------------------------------------

test("6: a second confirmation (sequential or concurrent) triggers no further calls or links", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();
  await reportFailure(token, { amount: 2999 });

  const { plan } = await authedFetch("/api/recovery-plan/current", token).then((r) => r.json());

  const first = await authedFetch(`/api/recovery-plan/${plan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  assert.equal(first.plan.status, "COMPLETED");
  assert.equal(first.idempotent, false);

  const second = await authedFetch(`/api/recovery-plan/${plan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  assert.equal(second.idempotent, true);
  assert.equal(second.plan.status, "COMPLETED");
  assert.equal(razorpayCallLog.length, 1);

  // concurrent
  await Promise.all([
    authedFetch(`/api/recovery-plan/${plan.id}/confirm`, token, { method: "POST" }),
    authedFetch(`/api/recovery-plan/${plan.id}/confirm`, token, { method: "POST" }),
  ]);
  assert.equal(razorpayCallLog.length, 1);

  const { AuditLog } = ctx.models;
  assert.equal(await AuditLog.countDocuments({ eventType: "PAYMENT_LINK_CREATED" }), 1);
});

// ---- 7. a stale/expired plan is revalidated, not blindly executed ------------------

test("7: an expired plan is cancelled on confirm and no action executes", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();
  const body = await reportFailure(token, { amount: 2999 });

  const { RecoveryPlan } = ctx.models;
  await RecoveryPlan.updateOne({ _id: body.recoveryPlan.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  const res = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  assert.equal(res.expired, true);
  assert.equal(res.plan.status, "CANCELLED");
  assert.equal(res.plan.items[0].status, "REMOVED");
  assert.equal(res.plan.items[0].removalReason, "PLAN_EXPIRED");
  assert.equal(razorpayCallLog.length, 0);
});

test("7b: if the underlying case's window expires before confirmation, the item is removed and re-resolved", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();
  const body = await reportFailure(token, { amount: 2999 });

  const { RecoveryCase, AuditLog } = ctx.models;
  await RecoveryCase.updateOne({ _id: body.recoveryCase._id }, { $set: { recoveryWindowExpiresAt: new Date(Date.now() - 1000) } });

  const res = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  const item = res.plan.items[0];
  assert.equal(item.status, "REMOVED");
  assert.equal(item.removalReason, "RECOVERY_WINDOW_EXPIRED");
  assert.equal(razorpayCallLog.length, 0);
  assert.equal((await RecoveryCase.findById(body.recoveryCase._id)).status, "EXPIRED");
  assert.ok(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "RECOVERY_PLAN_ITEM_REMOVED" }));
});

// ---- 8. a policy change before confirmation is respected --------------------------

test("8: lowering the autonomous-amount ceiling before confirmation removes the now-high-value link item", async () => {
  const { token, merchant } = await demoToken();
  razorpayHandler = linkSuccessHandler();
  const body = await reportFailure(token, { amount: 2999 });
  assert.equal(body.recoveryPlan.items[0].intervention, "CREATE_PAYMENT_LINK");

  const { Merchant, RecoveryCase } = ctx.models;
  await Merchant.updateOne({ _id: merchant.id }, { $set: { "policy.maxAutonomousAmount": 1000 } });

  const res = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  const item = res.plan.items[0];
  assert.equal(item.status, "REMOVED");
  assert.equal(item.removalReason, "HIGH_VALUE_REQUIRES_REVIEW");
  assert.equal(razorpayCallLog.length, 0);
  assert.equal((await RecoveryCase.findById(body.recoveryCase._id)).status, "ESCALATED");
});

// ---- 9. opt-out prevents voice contact even after the plan was prepared ------------

test("9: a customer who opts out after planning is never called; the voice item is removed", async () => {
  const { token, merchant } = await demoToken();
  const email = `loyal-${Date.now()}@example.com`;
  const customer = await seedTrustedCustomer(merchant.id, email);
  const body = await reportFailure(token, { customer: { name: "Loyal Customer", email }, amount: 2999 });
  assert.equal(body.recoveryPlan.items[0].intervention, "START_VOICE_RECOVERY");

  const { Customer, RecoveryCase, RecoveryAction, AuditLog } = ctx.models;
  await Customer.updateOne({ _id: customer._id }, { $set: { optedOut: true } });

  const res = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  const item = res.plan.items[0];
  assert.equal(item.status, "REMOVED");
  assert.equal(item.removalReason, "OPT_OUT_BEHAVIOR");

  assert.equal((await RecoveryCase.findById(body.recoveryCase._id)).voiceAttempts, 0);
  assert.equal((await RecoveryCase.findById(body.recoveryCase._id)).status, "STOPPED");
  assert.ok(!(await AuditLog.exists({ caseId: body.recoveryCase._id, eventType: "VOICE_RECOVERY_STARTED" })));
  assert.equal(await RecoveryAction.countDocuments({ caseId: body.recoveryCase._id, actionType: "START_VOICE_RECOVERY" }), 0);
});

test("9b: a customer already opted out at planning time never produces a customer-facing item", async () => {
  const { token } = await demoToken();
  const body = await reportFailure(token, {
    customer: { name: "Never Contact", email: `optout-${Date.now()}@example.com`, optedOut: true },
  });
  const item = body.recoveryPlan.items[0];
  assert.equal(item.intervention, "STOP");
  assert.equal(item.customerFacing, false);
});

// ---- 10. high-value cases stay escalated through the whole flow -------------------

test("10: a high-value case is escalated at planning and stays escalated after confirmation", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();
  const body = await reportFailure(token, { amount: 75000 });

  assert.equal(body.recoveryCase.status, "ESCALATED");
  assert.equal(body.recoveryPlan.items[0].intervention, "ESCALATE");
  assert.equal(body.recoveryPlan.items[0].customerFacing, false);

  const res = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, token, { method: "POST" }).then((r) => r.json());
  assert.equal(res.plan.items[0].status, "ESCALATED");
  assert.equal(res.plan.summary.escalated, 1);
  assert.equal(razorpayCallLog.length, 0);

  const { RecoveryCase } = ctx.models;
  const fresh = await RecoveryCase.findById(body.recoveryCase._id);
  assert.equal(fresh.status, "ESCALATED");
  assert.equal(fresh.recoveredAmount, 0);
});

// ---- 11. only the verified webhook marks revenue recovered ----------------------

test("11: a confirmed payment link is WAITING_OUTCOME until the verified webhook credits revenue", async () => {
  const { token } = await demoToken();
  razorpayHandler = linkSuccessHandler();
  const body = await reportFailure(token, { amount: 2999 });

  await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, token, { method: "POST" });

  const { RecoveryCase } = ctx.models;
  const afterConfirm = await RecoveryCase.findById(body.recoveryCase._id);
  assert.equal(afterConfirm.status, "WAITING_OUTCOME");
  assert.equal(afterConfirm.recoveredAmount, 0);

  const mid = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(mid.recoveredRevenue, 0);

  const rawBody = JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: {
        entity: { id: afterConfirm.razorpayPaymentLinkId, reference_id: String(afterConfirm._id), status: "paid", amount: 299900, currency: "INR" },
      },
    },
  });
  const hookRes = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signBody(rawBody), "x-razorpay-event-id": crypto.randomUUID() },
    body: rawBody,
  });
  assert.equal(hookRes.status, 200);

  const recovered = await RecoveryCase.findById(afterConfirm._id);
  assert.equal(recovered.status, "RECOVERED");
  assert.equal(recovered.recoveredAmount, 2999);
  const final = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(final.recoveredRevenue, 2999);
});

// ---- 12. merchant isolation -----------------------------------------------------

test("12: another merchant can neither see nor confirm this merchant's recovery plan", async () => {
  const { token, merchant } = await demoToken();
  const body = await reportFailure(token, { amount: 2999 });

  const { Merchant, RecoveryPlan } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const merchantB = await Merchant.create({ email: "merchant-b-plan@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  const getRes = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}`, tokenB);
  assert.equal(getRes.status, 404);

  const currentB = await authedFetch("/api/recovery-plan/current", tokenB).then((r) => r.json());
  assert.equal(currentB.plan, null);

  const confirmRes = await authedFetch(`/api/recovery-plan/${body.recoveryPlan.id}/confirm`, tokenB, { method: "POST" });
  assert.equal(confirmRes.status, 404);
  assert.equal(razorpayCallLog.length, 0);

  const stillPending = await RecoveryPlan.findById(body.recoveryPlan.id);
  assert.equal(stillPending.status, "PENDING_APPROVAL");
  assert.equal(String(stillPending.merchantId), String(merchant.id));
});
