// Day 6 — Razorpay Test Mode Payment Link integration. Exercises the real app against an
// in-memory MongoDB (tests/testUtils/testServer.js), with a fake rzp_test_-prefixed credential
// pair configured via envOverrides (never a real one — CLAUDE.md § Day 6 requirement 17/20: no
// live network call is required or made anywhere in this suite). The only outbound call this
// integration makes — the Razorpay Payment Links API — is intercepted by monkey-patching the
// global `fetch` used inside integrations/razorpay/client.js, delegating every other URL
// (including the test's own calls to the app under test) to the real fetch untouched.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { startTestServer } from "./testUtils/testServer.js";

const FAKE_KEY_ID = "rzp_test_fake0000000001";
const FAKE_KEY_SECRET = "fake_test_secret_never_real";
const FAKE_WEBHOOK_SECRET = "fake_webhook_secret_never_real";

let ctx;

before(async () => {
  ctx = await startTestServer({
    envOverrides: {
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

/** Creates + evaluates a case, returning it in POLICY_APPROVED with CREATE_PAYMENT_LINK selected. */
async function approvedCase(token, overrides = {}) {
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload(overrides)),
  }).then((r) => r.json());
  const evaluated = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());
  return evaluated.recoveryCase;
}

// ---- 1. payment-link creation: happy path ----------------------------------------------------

test("1: POST /:id/payment-link creates a real (mocked) Razorpay Test Mode link and moves the case to WAITING_OUTCOME", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });
  assert.equal(recoveryCase.status, "POLICY_APPROVED");
  assert.equal(recoveryCase.selectedIntervention, "CREATE_PAYMENT_LINK");

  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(res.status, 201);
  const body = await res.json();

  assert.equal(body.recoveryCase.status, "WAITING_OUTCOME");
  assert.equal(body.recoveryCase.attempts, 1);
  assert.equal(body.recoveryCase.recoveredAmount, 0); // never set at creation time
  assert.ok(body.paymentLink.id);
  assert.ok(body.paymentLink.shortUrl.startsWith("https://rzp.io/"));
  assert.equal(razorpayCallLog.length, 1);
});

// ---- 2. rupees -> paise conversion -------------------------------------------------------------

test("2: the amount sent to Razorpay is the case's rupee amount * 100 (paise), never the raw rupee value", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });

  let capturedAmount = null;
  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    capturedAmount = body.amount;
    assert.equal(body.accept_partial, false);
    assert.equal(body.reference_id, recoveryCase._id);
    assert.equal(body.notes.recoveryCaseId, recoveryCase._id);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };

  await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(capturedAmount, 299900);
});

// ---- 3. merchant authorization -------------------------------------------------------------------

test("3: a different merchant cannot create a payment link on another merchant's case (404)", async () => {
  const merchantA = await demoToken();
  const recoveryCase = await approvedCase(merchantA.token, { amount: 2999 });

  const { Merchant } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const merchantB = await Merchant.create({ email: "merchant-b-rzp@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, tokenB, { method: "POST" });
  assert.equal(res.status, 404);
  assert.equal(razorpayCallLog.length, 0);
});

// ---- 4. policy rejection prevents Razorpay call / high-value case never reaches Razorpay --------

test("4: a case not yet POLICY_APPROVED is rejected (409) and Razorpay is never called", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/payment-link`, token, {
    method: "POST",
  });
  assert.equal(res.status, 409);
  assert.equal(razorpayCallLog.length, 0);
});

test("5: a high-value case (₹75,000) resolves to ESCALATED and the payment-link route never calls Razorpay", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 75000 });
  assert.equal(recoveryCase.status, "ESCALATED");
  assert.equal(recoveryCase.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(res.status, 409);
  assert.equal(razorpayCallLog.length, 0);

  const { RecoveryCase } = ctx.models;
  const fresh = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(fresh.status, "ESCALATED");
  assert.equal(fresh.recoveredAmount, 0);
});

// ---- 6. duplicate payment-link requests are idempotent -------------------------------------------

test("6: two concurrent/duplicate payment-link requests create exactly one Razorpay link, the second reuses it", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });

  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };

  const first = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(first.status, 201);
  const firstBody = await first.json();

  const second = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(second.status, 200);
  const secondBody = await second.json();

  assert.equal(secondBody.reused, true);
  assert.equal(secondBody.paymentLink.id, firstBody.paymentLink.id);
  assert.equal(razorpayCallLog.length, 1); // never called twice
});

// ---- 7. a failed Razorpay request releases the claim and stays retryable ------------------------

test("7: a Razorpay failure releases the claim — the case stays POLICY_APPROVED and a retry can succeed", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });

  razorpayHandler = async () => fakeResponse(500, { error: { description: "Internal error" } });

  const failedRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, {
    method: "POST",
  });
  assert.equal(failedRes.status, 502);

  const { RecoveryCase } = ctx.models;
  const afterFailure = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(afterFailure.status, "POLICY_APPROVED"); // never marked recovered/executed
  assert.equal(afterFailure.razorpayPaymentLinkId, null);
  assert.equal(afterFailure.razorpayLinkClaimedAt, null); // claim released, not stuck

  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };
  const retryRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, {
    method: "POST",
  });
  assert.equal(retryRes.status, 201);
});

// ---- 7b. a stale claim is reclaimable (self-healing, simulating a crashed request) ---------------

test("7b: a stale (expired) claim is automatically reclaimable — a crashed request never permanently locks the case", async () => {
  const { token, merchant } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });

  const { RecoveryCase } = ctx.models;
  // Simulate a crashed request: claimed, but never released or resolved, and old enough to be
  // considered stale by the TTL in pipeline/tools.js.
  await RecoveryCase.updateOne(
    { _id: recoveryCase._id },
    { $set: { razorpayLinkClaimedAt: new Date(Date.now() - 60_000) } }
  );

  const { claimPaymentLinkCreation } = await import("../server/src/pipeline/tools.js");
  const claimed = await claimPaymentLinkCreation(recoveryCase._id, merchant.id);
  assert.ok(claimed, "a stale claim must be reclaimable, not a permanent lock");
});

// ---- 8. Razorpay not configured -----------------------------------------------------------------
// (see tests/razorpayNotConfigured.test.js for the "no credentials at all" 409 case — this file
// always has fake credentials configured via envOverrides, per module-caching constraints.)

// ---- 9. webhook: signature verification ----------------------------------------------------------

function signBody(bodyString, secret = FAKE_WEBHOOK_SECRET) {
  return crypto.createHmac("sha256", secret).update(bodyString).digest("hex");
}

async function createLiveLink(token, recoveryCase, { linkId = `plink_${crypto.randomUUID().slice(0, 12)}` } = {}) {
  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ id: linkId, amount: body.amount, referenceId: body.reference_id });
  };
  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  assert.equal(res.status, 201);
  return (await res.json()).paymentLink;
}

function paymentLinkWebhookBody({ event, linkId, referenceId, amount, currency = "INR" }) {
  return JSON.stringify({
    event,
    entity: "event",
    account_id: "acc_fake",
    created_at: Math.floor(Date.now() / 1000),
    contains: ["payment_link"],
    payload: {
      payment_link: {
        entity: { id: linkId, reference_id: referenceId, status: event === "payment_link.paid" ? "paid" : "expired", amount, amount_paid: event === "payment_link.paid" ? amount : 0, currency },
      },
    },
  });
}

test("9: a webhook with an invalid signature is rejected (400) and never mutates the case", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });
  const link = await createLiveLink(token, recoveryCase);

  const rawBody = paymentLinkWebhookBody({
    event: "payment_link.paid",
    linkId: link.id,
    referenceId: recoveryCase._id,
    amount: 299900,
  });

  const res = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": "0000000000000000000000000000000000000000000000000000000000000000",
      "x-razorpay-event-id": crypto.randomUUID(),
    },
    body: rawBody,
  });
  assert.equal(res.status, 400);

  const { RecoveryCase } = ctx.models;
  const fresh = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(fresh.status, "WAITING_OUTCOME"); // untouched
  assert.equal(fresh.recoveredAmount, 0);
});

// ---- 10. webhook: successful payment updates recoveredAmount ------------------------------------

test("10: a verified payment_link.paid webhook resolves the case to RECOVERED and sets recoveredAmount from the trusted event only", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });
  const link = await createLiveLink(token, recoveryCase);

  const eventId = crypto.randomUUID();
  const rawBody = paymentLinkWebhookBody({
    event: "payment_link.paid",
    linkId: link.id,
    referenceId: recoveryCase._id,
    amount: 299900,
  });
  const signature = signBody(rawBody);

  const res = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
    body: rawBody,
  });
  assert.equal(res.status, 200);

  const { RecoveryCase, AuditLog } = ctx.models;
  const fresh = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(fresh.status, "RECOVERED");
  assert.equal(fresh.recoveredAmount, 2999);

  const auditTypes = (await AuditLog.find({ caseId: recoveryCase._id })).map((e) => e.eventType);
  assert.ok(auditTypes.includes("RAZORPAY_WEBHOOK_VERIFIED"));
  assert.ok(auditTypes.includes("PAYMENT_RECOVERY_SUCCEEDED"));
});

// ---- 11. webhook idempotency: duplicate delivery never double-counts revenue --------------------

test("11: the same x-razorpay-event-id delivered twice does not mutate state or revenue twice", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });
  const link = await createLiveLink(token, recoveryCase);

  const eventId = crypto.randomUUID();
  const rawBody = paymentLinkWebhookBody({
    event: "payment_link.paid",
    linkId: link.id,
    referenceId: recoveryCase._id,
    amount: 299900,
  });
  const signature = signBody(rawBody);
  const headers = { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId };

  const first = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, { method: "POST", headers, body: rawBody });
  assert.equal(first.status, 200);
  const second = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, { method: "POST", headers, body: rawBody });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.status, "ALREADY_PROCESSED");

  const { RecoveryCase, WebhookEvent } = ctx.models;
  const fresh = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(fresh.recoveredAmount, 2999); // not 5998

  const events = await WebhookEvent.find({ eventId });
  assert.equal(events.length, 1); // unique index enforced exactly one record
});

// ---- 12. webhook: amount mismatch is rejected, never mutates state ------------------------------

test("12: a webhook whose amount does not match the case's stored amount is rejected without mutating the case", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });
  const link = await createLiveLink(token, recoveryCase);

  const eventId = crypto.randomUUID();
  const rawBody = paymentLinkWebhookBody({
    event: "payment_link.paid",
    linkId: link.id,
    referenceId: recoveryCase._id,
    amount: 999900, // ₹9,999 — does not match the case's ₹2,999
  });
  const signature = signBody(rawBody);

  const res = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
    body: rawBody,
  });
  assert.equal(res.status, 200); // acked so Razorpay doesn't retry a mismatch it can't fix

  const { RecoveryCase, AuditLog } = ctx.models;
  const fresh = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(fresh.status, "WAITING_OUTCOME"); // untouched
  assert.equal(fresh.recoveredAmount, 0);

  const rejected = await AuditLog.findOne({ caseId: recoveryCase._id, eventType: "RAZORPAY_WEBHOOK_REJECTED" });
  assert.ok(rejected);
  assert.equal(rejected.reason, "AMOUNT_MISMATCH");
});

// ---- 13. failed/expired link does not increase recovered revenue --------------------------------

test("13: a payment_link.expired webhook resolves the case to FAILED, never RECOVERED, and recoveredAmount stays 0", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });
  const link = await createLiveLink(token, recoveryCase);

  const eventId = crypto.randomUUID();
  const rawBody = paymentLinkWebhookBody({
    event: "payment_link.expired",
    linkId: link.id,
    referenceId: recoveryCase._id,
    amount: 299900,
  });
  const signature = signBody(rawBody);

  const res = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
    body: rawBody,
  });
  assert.equal(res.status, 200);

  const { RecoveryCase } = ctx.models;
  const fresh = await RecoveryCase.findById(recoveryCase._id);
  assert.equal(fresh.status, "FAILED");
  assert.equal(fresh.recoveredAmount, 0);
});

// ---- 14. dashboard recovered revenue reflects only the verified webhook outcome ------------------

test("14: dashboard recoveredRevenue reflects the verified webhook outcome, not the payment-link creation step", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });

  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };
  const createRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, {
    method: "POST",
  }).then((r) => r.json());

  const midSummary = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(midSummary.recoveredRevenue, 0); // link created, not yet paid

  const eventId = crypto.randomUUID();
  const rawBody = paymentLinkWebhookBody({
    event: "payment_link.paid",
    linkId: createRes.paymentLink.id,
    referenceId: recoveryCase._id,
    amount: 299900,
  });
  const signature = signBody(rawBody);
  await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
    body: rawBody,
  });

  const finalSummary = await authedFetch("/api/dashboard/summary", token).then((r) => r.json());
  assert.equal(finalSummary.recoveredRevenue, 2999);
});

// ---- 15. voice uses the same executor as the text flow -------------------------------------------

test("15: routes/voice.js and routes/recoveryCases.js both call the SAME createLivePaymentLink function — no separate voice Razorpay executor", async () => {
  const voiceSource = await readFile(new URL("../server/src/routes/voice.js", import.meta.url), "utf8");
  const recoveryCasesSource = await readFile(new URL("../server/src/routes/recoveryCases.js", import.meta.url), "utf8");

  // Both import createLivePaymentLink from the shared pipeline/tools.js module...
  assert.match(voiceSource, /createLivePaymentLink.*from ["']\.\.\/pipeline\/tools\.js["']/s);
  assert.match(recoveryCasesSource, /createLivePaymentLink.*from ["']\.\.\/pipeline\/tools\.js["']/s);

  // ...and neither imports the Razorpay PAYMENT-CREATING adapter directly (only tools.js
  // does) — both are allowed to import isRazorpayConfigured() from client.js, since that's
  // just a read-only config check, not a Razorpay API call.
  assert.ok(
    !/integrations\/razorpay\/paymentLinks/.test(voiceSource),
    "voice.js must not import the Razorpay payment-link adapter directly"
  );
  assert.ok(
    !/integrations\/razorpay\/paymentLinks/.test(recoveryCasesSource),
    "recoveryCases.js must not import the Razorpay payment-link adapter directly"
  );
});

test("15b: createLivePaymentLink resolves through the exact same executeAction function the simulated path uses", async () => {
  const toolsSource = await readFile(new URL("../server/src/pipeline/tools.js", import.meta.url), "utf8");
  assert.match(toolsSource, /import \{ executeAction \} from ["']\.\/actionExecutor\.js["']/);
});

// ---- 16. secrets never reach client source or API responses -------------------------------------

test("16: no RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, or Razorpay-adapter import exists anywhere under client/", async () => {
  const clientSrcUrl = new URL("../client/src/", import.meta.url);

  async function collectFiles(dirUrl) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dirUrl);
      if (entry.isDirectory()) files.push(...(await collectFiles(entryUrl)));
      else if (/\.(js|jsx)$/.test(entry.name)) files.push(entryUrl);
    }
    return files;
  }

  const files = await collectFiles(clientSrcUrl);
  assert.ok(files.length > 0);
  for (const fileUrl of files) {
    const source = await readFile(fileUrl, "utf8");
    assert.ok(!/RAZORPAY_KEY_SECRET/.test(source), `${fileUrl} must not reference RAZORPAY_KEY_SECRET`);
    assert.ok(!/RAZORPAY_WEBHOOK_SECRET/.test(source), `${fileUrl} must not reference RAZORPAY_WEBHOOK_SECRET`);
    assert.ok(!/integrations\/razorpay/.test(source), `${fileUrl} must not import the Razorpay adapter`);
  }
});

test("16b: the payment-link API response never contains a secret-shaped field", async () => {
  const { token } = await demoToken();
  const recoveryCase = await approvedCase(token, { amount: 2999 });

  razorpayHandler = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return successfulLinkResponse({ amount: body.amount, referenceId: body.reference_id });
  };
  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/payment-link`, token, { method: "POST" });
  const body = await res.json();
  const serialized = JSON.stringify(body).toLowerCase();
  for (const banned of ["razorpay_key_secret", "razorpay_webhook_secret", FAKE_KEY_SECRET.toLowerCase(), FAKE_WEBHOOK_SECRET.toLowerCase()]) {
    assert.ok(!serialized.includes(banned), `payment-link response leaked "${banned}"`);
  }
});

test("16c: integrations/razorpay/client.js is the only file that builds a Razorpay Authorization header", async () => {
  const files = [
    "../server/src/integrations/razorpay/paymentLinks.js",
    "../server/src/integrations/razorpay/webhookVerify.js",
    "../server/src/pipeline/tools.js",
    "../server/src/routes/recoveryCases.js",
    "../server/src/routes/voice.js",
  ];
  for (const relPath of files) {
    const source = await readFile(new URL(relPath, import.meta.url), "utf8");
    assert.ok(!/RAZORPAY_KEY_SECRET/.test(source), `${relPath} must not read RAZORPAY_KEY_SECRET directly`);
  }
});
