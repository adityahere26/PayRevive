// Tests for GET /api/dashboard/payments-overview (server/src/routes/dashboard.js) — the
// business-owner Payments page's data source. Exercises the real app against an in-memory
// MongoDB, per tests/testUtils/testServer.js.

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

test("payments-overview: aggregates real clients/passed/failed counts and joins failed payments with their recovery case", async () => {
  const { token } = await demoToken();
  const { Payment, RecoveryCase } = ctx.models;

  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 3500, failureReason: "card_expired" })),
  }).then((r) => r.json());

  await Payment.create({
    merchantId: created.customer.merchantId,
    customerId: created.customer._id,
    amount: 1000,
    currency: "INR",
    status: "paid",
    razorpayPaymentId: "pay_test_paid_1",
  });

  const res = await authedFetch("/api/dashboard/payments-overview", token);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.totalClients, 1);
  assert.equal(body.paymentsPassed, 1);
  assert.equal(body.paymentsFailed, 1);
  assert.equal(body.failedPayments.length, 1);

  const row = body.failedPayments[0];
  assert.equal(row.customerName, "Priya Sharma");
  assert.equal(row.amount, 3500);
  assert.equal(row.failureReason, "card_expired");
  assert.ok(row.recoveryCase, "joined recovery case exists");
  assert.equal(String(row.recoveryCase.id), String(created.recoveryCase._id));
  assert.equal(row.recoveryCase.status, created.recoveryCase.status);

  const caseCount = await RecoveryCase.countDocuments({});
  assert.equal(caseCount, 1, "sanity: exactly one recovery case exists for the one failed payment");
});

test("payments-overview: never leaks another merchant's clients or payments", async () => {
  const { Merchant, Customer, Payment } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");

  const merchantB = await Merchant.create({ email: "merchant-b@test.payrevive.dev", name: "Merchant B" });
  const customerB = await Customer.create({ merchantId: merchantB._id, name: "Other Merchant's Customer" });
  await Payment.create({
    merchantId: merchantB._id,
    customerId: customerB._id,
    amount: 9999,
    currency: "INR",
    status: "failed",
    failureReason: "bank_declined",
  });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  const { token: tokenA } = await demoToken();
  await authedFetch("/api/demo/payment-failure", tokenA, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  });

  const resA = await authedFetch("/api/dashboard/payments-overview", tokenA).then((r) => r.json());
  assert.equal(resA.totalClients, 1);
  assert.equal(resA.paymentsFailed, 1);
  assert.ok(!resA.failedPayments.some((p) => p.customerName === "Other Merchant's Customer"));

  const resB = await authedFetch("/api/dashboard/payments-overview", tokenB).then((r) => r.json());
  assert.equal(resB.totalClients, 1);
  assert.equal(resB.paymentsFailed, 1);
  assert.equal(resB.failedPayments[0].customerName, "Other Merchant's Customer");
});

test("GET /api/dashboard/payments-overview requires authentication", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/dashboard/payments-overview`);
  assert.equal(res.status, 401);
});
