// The real, code-free integration path (ARCHITECTURE.md § Inbound payment-failure webhook):
// a connected merchant pastes a per-merchant webhook URL + signing secret into their Razorpay
// Dashboard, and `payment.failed` deliveries to
// POST /api/webhooks/razorpay/inbound/:webhookId flow into the SAME recovery pipeline the demo
// "Simulate Payment Failure" control uses. Runs the real app against an in-memory MongoDB.
//
// Autoplan is ON here (envOverrides) so a delivered failure produces a PENDING_APPROVAL
// recovery-plan item, exactly as in production.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";

let ctx;
let signRazorpayWebhookBody;
let signMerchantToken;

before(async () => {
  ctx = await startTestServer({ envOverrides: { RECOVERY_AUTOPLAN_ENABLED: "true" } });
  ({ signRazorpayWebhookBody } = await import(
    "../server/src/integrations/razorpay/webhookVerify.js"
  ));
  ({ signMerchantToken } = await import("../server/src/lib/jwt.js"));
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

async function getIntegration(token) {
  const res = await authedFetch("/api/merchant/integration", token);
  const body = await res.json();
  return { res, integration: body.integration };
}

// A minimal, well-formed Razorpay `payment.failed` event.
function paymentFailedEvent({
  amount = 4999,
  currency = "INR",
  email = "buyer@example.com",
  contact = "+919812345678",
  reason = "insufficient funds on card",
  paymentId = "pay_TESTINBOUND01",
  name,
  event = "payment.failed",
} = {}) {
  return {
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: amount * 100, // Razorpay sends paise
          currency,
          status: "failed",
          email,
          contact,
          error_code: "BAD_REQUEST_ERROR",
          error_description: reason,
          notes: name ? { name } : {},
        },
      },
    },
  };
}

async function deliver({ webhookId, secret, event, eventId, signature }) {
  const rawBody = JSON.stringify(event);
  const sig = signature ?? signRazorpayWebhookBody(rawBody, secret);
  const res = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay/inbound/${webhookId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": sig,
      "x-razorpay-event-id": eventId,
    },
    body: rawBody,
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

// ---- 1. GET provisions a credential and is idempotent -------------------------------------

test("1: GET /api/merchant/integration provisions a webhookId + secret and returns the same on repeat", async () => {
  const { token, merchant } = await demoToken();

  const { res, integration } = await getIntegration(token);
  assert.equal(res.status, 200);
  assert.match(integration.webhookId, /^wh_[0-9a-f]{24}$/);
  assert.equal(integration.webhookSecret.length, 64);
  assert.ok(integration.webhookUrl.endsWith(`/api/webhooks/razorpay/inbound/${integration.webhookId}`));
  assert.deepEqual(integration.events, ["payment.failed"]);
  assert.ok(integration.provisionedAt);

  const again = await getIntegration(token);
  assert.equal(again.integration.webhookId, integration.webhookId);
  assert.equal(again.integration.webhookSecret, integration.webhookSecret);

  const { AuditLog } = ctx.models;
  const provisioned = await AuditLog.find({ merchantId: merchant.id, eventType: "MERCHANT_WEBHOOK_PROVISIONED" });
  assert.equal(provisioned.length, 1);
});

// ---- 2. regenerate rotates both values; the old endpoint stops resolving ------------------

test("2: POST /regenerate rotates webhookId + secret, audits it, and the old webhookId 404s", async () => {
  const { token, merchant } = await demoToken();
  const { integration: first } = await getIntegration(token);

  const rotateRes = await authedFetch("/api/merchant/integration/regenerate", token, { method: "POST" });
  const { integration: second } = await rotateRes.json();
  assert.equal(rotateRes.status, 200);
  assert.notEqual(second.webhookId, first.webhookId);
  assert.notEqual(second.webhookSecret, first.webhookSecret);
  assert.ok(second.rotatedAt);

  const { AuditLog } = ctx.models;
  const rot = await AuditLog.findOne({ merchantId: merchant.id, eventType: "MERCHANT_WEBHOOK_SECRET_ROTATED" });
  assert.ok(rot);
  assert.equal(rot.actor, "MERCHANT");
  assert.equal(rot.metadata.previousWebhookId, first.webhookId);

  const old = await deliver({
    webhookId: first.webhookId,
    secret: first.webhookSecret,
    event: paymentFailedEvent(),
    eventId: "evt_after_rotate",
  });
  assert.equal(old.res.status, 404);

  const fresh = await deliver({
    webhookId: second.webhookId,
    secret: second.webhookSecret,
    event: paymentFailedEvent(),
    eventId: "evt_after_rotate_2",
  });
  assert.equal(fresh.res.status, 200);
});

// ---- 3. a valid signed payment.failed creates the real records ----------------------------

test("3: a valid signed payment.failed creates Customer + failed Payment + RecoveryCase, tagged source=RAZORPAY_WEBHOOK", async () => {
  const { token, merchant } = await demoToken();
  const { integration } = await getIntegration(token);

  const { res, body } = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent({ amount: 3200, email: "asha@example.com", name: "Asha Rao", paymentId: "pay_ABC" }),
    eventId: "evt_ingest_1",
  });
  assert.equal(res.status, 200);
  assert.equal(body.status, "PROCESSED");
  assert.ok(body.recoveryCaseId);

  const { Customer, Payment, RecoveryCase, AuditLog } = ctx.models;
  const customer = await Customer.findOne({ merchantId: merchant.id, email: "asha@example.com" });
  assert.ok(customer);
  assert.equal(customer.name, "Asha Rao");

  const payment = await Payment.findOne({ merchantId: merchant.id, status: "failed" });
  assert.ok(payment);
  assert.equal(payment.amount, 3200);
  assert.equal(payment.razorpayPaymentId, "pay_ABC");

  const rc = await RecoveryCase.findById(body.recoveryCaseId);
  assert.ok(rc);
  assert.equal(String(rc.merchantId), String(merchant.id));
  assert.equal(rc.sourceType, "PAYMENT_FAILURE");
  assert.equal(String(rc.paymentId), String(payment._id));

  const detected = await AuditLog.findOne({ caseId: rc._id, eventType: "REVENUE_RISK_DETECTED" });
  assert.ok(detected);
  assert.equal(detected.metadata.source, "RAZORPAY_WEBHOOK");
});

// ---- 4. the ingested case reaches a PENDING_APPROVAL recovery plan ------------------------

test("4: the ingested case lands as an item on the merchant's PENDING_APPROVAL recovery plan", async () => {
  const { token, merchant } = await demoToken();
  const { integration } = await getIntegration(token);

  const { body } = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent({ amount: 2999, email: "plan@example.com" }),
    eventId: "evt_plan_1",
  });

  const { RecoveryPlan } = ctx.models;
  const plan = await RecoveryPlan.findOne({ merchantId: merchant.id, status: "PENDING_APPROVAL" });
  assert.ok(plan, "a PENDING_APPROVAL plan exists");
  const item = plan.items.find((i) => String(i.caseId) === String(body.recoveryCaseId));
  assert.ok(item, "the ingested case is an item on the plan");
});

// ---- 5. a bad signature is rejected and writes nothing but an audit ----------------------

test("5: a bad signature → 400, no records created, RAZORPAY_WEBHOOK_REJECTED audited", async () => {
  const { token, merchant } = await demoToken();
  const { integration } = await getIntegration(token);

  const { res } = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent(),
    eventId: "evt_badsig",
    signature: "0".repeat(64),
  });
  assert.equal(res.status, 400);

  const { Customer, Payment, RecoveryCase, WebhookEvent, AuditLog } = ctx.models;
  assert.equal(await Customer.countDocuments({ merchantId: merchant.id }), 0);
  assert.equal(await Payment.countDocuments({ merchantId: merchant.id }), 0);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchant.id }), 0);
  assert.equal(await WebhookEvent.countDocuments({}), 0);

  const rejected = await AuditLog.findOne({ merchantId: merchant.id, eventType: "RAZORPAY_WEBHOOK_REJECTED" });
  assert.ok(rejected);
  assert.equal(rejected.reason, "INBOUND_SIGNATURE_INVALID");
});

// ---- 6. an unknown webhookId is a 404 that touches nothing -------------------------------

test("6: an unknown :webhookId → 404, nothing created, nothing audited", async () => {
  await demoToken();

  const { res } = await deliver({
    webhookId: "wh_000000000000000000000000",
    secret: "irrelevant-secret",
    event: paymentFailedEvent(),
    eventId: "evt_unknown",
  });
  assert.equal(res.status, 404);

  const { Customer, Payment, RecoveryCase, WebhookEvent, AuditLog } = ctx.models;
  assert.equal(await Customer.countDocuments({}), 0);
  assert.equal(await Payment.countDocuments({}), 0);
  assert.equal(await RecoveryCase.countDocuments({}), 0);
  assert.equal(await WebhookEvent.countDocuments({}), 0);
  assert.equal(await AuditLog.countDocuments({}), 0);
});

// ---- 7. duplicate X-Razorpay-Event-Id is idempotent ------------------------------------

test("7: a duplicate x-razorpay-event-id is ignored — no second case/payment", async () => {
  const { token, merchant } = await demoToken();
  const { integration } = await getIntegration(token);

  const first = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent({ email: "dup@example.com" }),
    eventId: "evt_dup",
  });
  assert.equal(first.body.status, "PROCESSED");

  const second = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent({ email: "dup@example.com" }),
    eventId: "evt_dup",
  });
  assert.equal(second.res.status, 200);
  assert.equal(second.body.status, "ALREADY_PROCESSED");

  const { Payment, RecoveryCase } = ctx.models;
  assert.equal(await Payment.countDocuments({ merchantId: merchant.id, status: "failed" }), 1);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchant.id }), 1);
});

// ---- 8. merchant isolation -------------------------------------------------------------

test("8: an event to merchant A's endpoint only ever creates data under A; B's rotate can't touch A", async () => {
  const { token: tokenA, merchant: merchantA } = await demoToken();
  const { integration: intA } = await getIntegration(tokenA);

  const { Merchant } = ctx.models;
  const merchantB = await Merchant.create({ email: "inbound-b@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });
  const { integration: intB } = await getIntegration(tokenB);
  assert.notEqual(intB.webhookId, intA.webhookId);

  await deliver({
    webhookId: intA.webhookId,
    secret: intA.webhookSecret,
    event: paymentFailedEvent({ email: "iso@example.com" }),
    eventId: "evt_iso_A",
  });

  const { Customer, Payment, RecoveryCase } = ctx.models;
  assert.equal(await Customer.countDocuments({ merchantId: merchantA.id }), 1);
  assert.equal(await Payment.countDocuments({ merchantId: merchantA.id }), 1);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchantA.id }), 1);
  assert.equal(await Customer.countDocuments({ merchantId: merchantB._id }), 0);
  assert.equal(await Payment.countDocuments({ merchantId: merchantB._id }), 0);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchantB._id }), 0);

  await authedFetch("/api/merchant/integration/regenerate", tokenB, { method: "POST" });
  const afterA = await getIntegration(tokenA);
  assert.equal(afterA.integration.webhookId, intA.webhookId);
  assert.equal(afterA.integration.webhookSecret, intA.webhookSecret);
});

// ---- 9. an opted-out customer is still routed through policy (STOPPED), not bypassed ------

test("9: payment.failed for an opted-out customer creates the case and the pipeline STOPs it", async () => {
  const { token, merchant } = await demoToken();
  const { integration } = await getIntegration(token);

  const { Customer, RecoveryCase } = ctx.models;
  await Customer.create({
    merchantId: merchant.id,
    name: "Opted Out",
    email: "optout@example.com",
    optedOut: true,
  });

  const { body } = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent({ email: "optout@example.com", amount: 2450 }),
    eventId: "evt_optout",
  });

  const rc = await RecoveryCase.findById(body.recoveryCaseId);
  assert.ok(rc);
  assert.equal(rc.status, "STOPPED");
});

// ---- 10. a non-payment.failed event is acknowledged but ignored --------------------------

test("10: a non-payment.failed event → 200 IGNORED, nothing created", async () => {
  const { token, merchant } = await demoToken();
  const { integration } = await getIntegration(token);

  const { res, body } = await deliver({
    webhookId: integration.webhookId,
    secret: integration.webhookSecret,
    event: paymentFailedEvent({ event: "payment.captured" }),
    eventId: "evt_captured",
  });
  assert.equal(res.status, 200);
  assert.equal(body.status, "IGNORED");

  const { Customer, Payment, RecoveryCase, WebhookEvent } = ctx.models;
  assert.equal(await Customer.countDocuments({ merchantId: merchant.id }), 0);
  assert.equal(await Payment.countDocuments({ merchantId: merchant.id }), 0);
  assert.equal(await RecoveryCase.countDocuments({ merchantId: merchant.id }), 0);
  assert.equal(await WebhookEvent.countDocuments({}), 1); // recorded, marked PROCESSED
});

// ---- 11. the integration endpoints require auth -----------------------------------------

test("11: /api/merchant/integration requires a bearer token", async () => {
  const get = await fetch(`${ctx.baseUrl}/api/merchant/integration`);
  assert.equal(get.status, 401);
  const post = await fetch(`${ctx.baseUrl}/api/merchant/integration/regenerate`, { method: "POST" });
  assert.equal(post.status, 401);
});

// ---- 12. the platform /razorpay webhook route is unchanged ------------------------------

test("12: the platform POST /api/webhooks/razorpay route still rejects a body with no secret configured", async () => {
  // RAZORPAY_WEBHOOK_SECRET is forced empty by the harness — the untouched platform handler
  // must still 400 here, proving the inbound route was added without altering it.
  const res = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-event-id": "evt_plat" },
    body: JSON.stringify({ event: "payment_link.paid" }),
  });
  assert.equal(res.status, 400);
});
