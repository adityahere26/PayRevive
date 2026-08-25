// Tests for GET/PUT /api/merchant/policy (server/src/routes/policy.js). This route reads and
// writes the SAME merchant.policy subdocument (server/src/models/Merchant.js) the Policy
// Engine (server/src/policy/policyPrecedence.js) already reads fresh from the database on
// every pipeline run — the decisive test here is that a policy update changes what the NEXT
// /evaluate call decides, with zero Policy Engine code involved in this test file.

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

test("GET/PUT /api/merchant/policy require authentication", async () => {
  const getRes = await fetch(`${ctx.baseUrl}/api/merchant/policy`);
  assert.equal(getRes.status, 401);
  const putRes = await fetch(`${ctx.baseUrl}/api/merchant/policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxRecoveryAttempts: 3 }),
  });
  assert.equal(putRes.status, 401);
});

test("GET /api/merchant/policy returns the merchant's actual stored policy (schema defaults for a fresh demo merchant)", async () => {
  const { token } = await demoToken();
  const res = await authedFetch("/api/merchant/policy", token);
  assert.equal(res.status, 200);
  const { policy } = await res.json();

  assert.equal(policy.maxRecoveryAttempts, 2);
  assert.equal(policy.maxVoiceAttempts, 1);
  assert.equal(policy.maxAutonomousAmount, 50000);
  assert.equal(policy.recoveryWindowHours, 72);
  assert.equal(policy.optOutBehavior, "DO_NOT_CONTACT");
  assert.equal(policy.maxContactAttempts, 2);
  assert.equal(policy.voiceEnabled, true);
});

test("PUT /api/merchant/policy rejects out-of-range and unknown fields — never silently clamped or dropped", async () => {
  const { token } = await demoToken();

  const negative = await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ maxRecoveryAttempts: -1 }),
  });
  assert.equal(negative.status, 400);

  const wrongType = await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ maxAutonomousAmount: "not-a-number" }),
  });
  assert.equal(wrongType.status, 400);

  const unknownField = await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ someRandomField: 123 }),
  });
  assert.equal(unknownField.status, 400);

  const invalidOptOut = await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ optOutBehavior: "IGNORE_CUSTOMER" }),
  });
  assert.equal(invalidOptOut.status, 400);
});

test("PUT /api/merchant/policy persists changes, reports changedFields, and writes a merchant-scoped audit event", async () => {
  const { token } = await demoToken();

  const res = await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ maxAutonomousAmount: 1000, maxRecoveryAttempts: 5 }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.policy.maxAutonomousAmount, 1000);
  assert.equal(body.policy.maxRecoveryAttempts, 5);
  assert.deepEqual(new Set(body.changedFields), new Set(["maxAutonomousAmount", "maxRecoveryAttempts"]));

  const refetch = await authedFetch("/api/merchant/policy", token).then((r) => r.json());
  assert.equal(refetch.policy.maxAutonomousAmount, 1000);

  const { AuditLog } = ctx.models;
  const events = await AuditLog.find({ eventType: "MERCHANT_POLICY_UPDATED" });
  assert.equal(events.length, 1);
  assert.equal(events[0].caseId, null);
  assert.equal(events[0].actor, "MERCHANT");

  // A no-op update (identical values) changes nothing and writes no additional audit event.
  const noop = await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ maxAutonomousAmount: 1000 }),
  }).then((r) => r.json());
  assert.deepEqual(noop.changedFields, []);
  assert.equal(await AuditLog.countDocuments({ eventType: "MERCHANT_POLICY_UPDATED" }), 1);
});

test("a policy update changes what the NEXT /evaluate call decides — the Policy Engine reads the updated value, no pipeline code involved here", async () => {
  const { token } = await demoToken();

  await authedFetch("/api/merchant/policy", token, {
    method: "PUT",
    body: JSON.stringify({ maxAutonomousAmount: 1000 }),
  });

  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Priya Sharma", email: `priya-${Date.now()}@example.com` },
      amount: 2000, // above the new, lowered threshold, below the old 50000 default
      currency: "INR",
      failureReason: "insufficient_funds",
    }),
  }).then((r) => r.json());

  const evaluated = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(evaluated.recoveryCase.status, "ESCALATED");
  assert.equal(evaluated.recoveryCase.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");
});

test("GET/PUT /api/merchant/policy never leaks or lets one merchant modify another's policy", async () => {
  const { signMerchantToken, DEMO_TOKEN_TTL } = await import("../server/src/lib/jwt.js");
  const { Merchant } = ctx.models;

  const { token: tokenA } = await demoToken();
  await authedFetch("/api/merchant/policy", tokenA, {
    method: "PUT",
    body: JSON.stringify({ maxAutonomousAmount: 1000 }),
  });

  const merchantB = await Merchant.create({ email: "policy-merchant-b@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: DEMO_TOKEN_TTL });

  const policyB = await authedFetch("/api/merchant/policy", tokenB).then((r) => r.json());
  assert.equal(policyB.policy.maxAutonomousAmount, 50000, "merchant B still has its own untouched default — merchant A's update never leaked");

  await authedFetch("/api/merchant/policy", tokenB, {
    method: "PUT",
    body: JSON.stringify({ maxAutonomousAmount: 7777 }),
  });

  const policyAAfter = await authedFetch("/api/merchant/policy", tokenA).then((r) => r.json());
  assert.equal(policyAAfter.policy.maxAutonomousAmount, 1000, "merchant B's update never touched merchant A's policy");
});
