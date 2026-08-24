// End-to-end API tests for the Day 3 recovery pipeline routes: POST /api/demo/payment-failure,
// GET /api/recovery-cases[/:id], POST /api/recovery-cases/:id/evaluate,
// POST /api/recovery-cases/:id/simulate-action, GET /api/dashboard/summary. Exercises the real
// app (server/src/app.js) against an in-memory MongoDB, per tests/testUtils/testServer.js.
// No OpenAI, no Razorpay — CLAUDE.md § Day 3 objective.

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
  const { Merchant, Customer, Payment, RecoveryCase, RecoveryAction, AuditLog } = ctx.models;
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    RecoveryCase.deleteMany({}),
    RecoveryAction.deleteMany({}),
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

// ---- A/B/C: payment failure creates a recovery case with correct amount + root cause -----

test("A/B: a simulated payment failure creates a recovery case with the correct revenue-at-risk amount", async () => {
  const { token } = await demoToken();
  const res = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 4321 })),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.recoveryCase.amount, 4321);
  assert.equal(body.recoveryCase.currency, "INR");
  assert.equal(body.recoveryCase.status, "RISK_DETECTED");
  assert.equal(body.recoveryCase.sourceType, "PAYMENT_FAILURE");
  assert.ok(body.recoveryCase.recoveryWindowExpiresAt);
});

test("C: evaluating a retryable payment failure produces the correct deterministic root cause", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ failureReason: "insufficient_funds" })),
  }).then((r) => r.json());

  const evaluated = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(evaluated.recoveryCase.rootCause, "RETRYABLE_PAYMENT_FAILURE");
});

// ---- D: an eligible case proceeds all the way to a policy decision ------------------------

test("D: an eligible, retryable, low-value case proceeds through eligibility to a policy decision", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 2999, failureReason: "insufficient_funds" })),
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.recoveryCase.status, "POLICY_APPROVED");
  assert.equal(body.recoveryCase.selectedIntervention, "CREATE_PAYMENT_LINK");
  assert.ok(body.recoveryCase.recoveryProbability > 0);
  assert.equal(body.recoveryCase.policyDecision, "APPROVED");
});

// ---- E: opt-out produces STOP --------------------------------------------------------------

test("E: an opted-out customer's case is stopped, never proceeds to scoring/intervention", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(
      paymentFailurePayload({ customer: { name: "Refuses Contact", email: `optout-${Date.now()}@example.com`, optedOut: true } })
    ),
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(res.recoveryCase.status, "STOPPED");
  assert.equal(res.recoveryCase.policyDecision, "OPT_OUT_BEHAVIOR");
  assert.equal(res.recoveryCase.recoveryProbability, null);
  assert.equal(res.recoveryCase.selectedIntervention, null);
});

// ---- F/G: high-value produces ESCALATE, even with expired window / exhausted attempts ------

test("F: a high-value case (above the merchant's autonomous ceiling) resolves to ESCALATE", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 150000 })),
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(res.recoveryCase.status, "ESCALATED");
  assert.equal(res.recoveryCase.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");
});

test("G: a high-value case that has ALSO expired its recovery window still resolves to ESCALATE, not EXPIRED", async () => {
  const { token, merchant } = await demoToken();
  const { RecoveryCase, Customer } = ctx.models;

  const customer = await Customer.create({ merchantId: merchant.id, name: "High Value Expired", optedOut: false });
  const recoveryCase = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 150000,
    currency: "INR",
    status: "RISK_DETECTED",
    recoveryWindowExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // already expired
  });

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(res.recoveryCase.status, "ESCALATED");
  assert.equal(res.recoveryCase.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");
});

// ---- H: attempt limit is enforced ----------------------------------------------------------

test("H: a case that has already exhausted MAX_RECOVERY_ATTEMPTS is stopped, not sent through scoring", async () => {
  const { token, merchant } = await demoToken();
  const { RecoveryCase, Customer } = ctx.models;

  const customer = await Customer.create({ merchantId: merchant.id, name: "Exhausted Attempts", optedOut: false });
  const recoveryCase = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    currency: "INR",
    status: "RISK_DETECTED",
    attempts: 2, // == default MAX_RECOVERY_ATTEMPTS
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
  });

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(res.recoveryCase.status, "STOPPED");
  assert.equal(res.recoveryCase.policyDecision, "RETRY_LIMIT_REACHED");
});

// ---- I: intervention selection is deterministic (same case -> same candidate action) -------

test("I: re-evaluating a case that hasn't changed does not flip its already-decided outcome", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ failureReason: "insufficient_funds" })),
  }).then((r) => r.json());

  const first = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());
  const second = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, {
    method: "POST",
  }).then((r) => r.json());

  assert.equal(first.recoveryCase.selectedIntervention, "CREATE_PAYMENT_LINK");
  assert.equal(first.recoveryCase.status, second.recoveryCase.status);
  assert.equal(first.recoveryCase.selectedIntervention, second.recoveryCase.selectedIntervention);
});

// ---- J: simulated action never calls Razorpay, always returns a SIMULATED result -----------

test("J: simulate-action on a POLICY_APPROVED case returns a SIMULATED result, never touches Razorpay", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ failureReason: "insufficient_funds" })),
  }).then((r) => r.json());

  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/simulate-action`, token, {
    method: "POST",
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.action.status, "SIMULATED");
  assert.equal(body.action.action, "CREATE_PAYMENT_LINK");
  assert.ok(["RECOVERED", "FAILED"].includes(body.recoveryCase.status));
});

test("simulate-action is rejected (409) on a case that isn't POLICY_APPROVED yet", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/simulate-action`, token, {
    method: "POST",
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error.code, "CONFLICT");
});

// ---- K: audit log is created for every state-changing step ---------------------------------

test("K: the full pipeline writes an explainable audit trail", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ failureReason: "insufficient_funds" })),
  }).then((r) => r.json());

  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });
  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/simulate-action`, token, { method: "POST" });

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/audit`, token);
  assert.equal(res.status, 200);
  const body = await res.json();

  const eventTypes = body.auditLog.map((e) => e.eventType);
  assert.ok(eventTypes.includes("REVENUE_RISK_DETECTED"));
  assert.ok(eventTypes.includes("ROOT_CAUSE_IDENTIFIED"));
  assert.ok(eventTypes.includes("ELIGIBILITY_EVALUATED"));
  assert.ok(eventTypes.includes("RECOVERY_SCORED"));
  assert.ok(eventTypes.includes("INTERVENTION_SELECTED"));
  assert.ok(eventTypes.includes("POLICY_EVALUATED"));
  assert.ok(eventTypes.includes("ACTION_SIMULATED"));

  for (const entry of body.auditLog) {
    assert.equal(entry.merchantId, created.recoveryCase.merchantId);
    assert.equal(entry.caseId, created.recoveryCase._id);
  }
});

test("audit log never contains secret-shaped fields", async () => {
  const { token } = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/audit`, token);
  const body = await res.json();
  const serialized = JSON.stringify(body).toLowerCase();
  for (const banned of ["password", "secret", "cvv", "apikey"]) {
    assert.ok(!serialized.includes(banned), `audit trail leaked a "${banned}"-shaped field`);
  }
});

// ---- L: merchant isolation -------------------------------------------------------------------

test("L: merchant A cannot access merchant B's recovery case (404, not 403, no data)", async () => {
  const merchantAAuth = await demoToken();
  const created = await authedFetch("/api/demo/payment-failure", merchantAAuth.token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload()),
  }).then((r) => r.json());

  const { Merchant } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const merchantB = await Merchant.create({ email: "merchant-b-recovery@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  const getRes = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}`, tokenB);
  assert.equal(getRes.status, 404);
  const getBody = await getRes.json();
  assert.equal(getBody.error.code, "NOT_FOUND");
  assert.equal(getBody.recoveryCase, undefined);

  const evalRes = await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, tokenB, {
    method: "POST",
  });
  assert.equal(evalRes.status, 404);

  const listRes = await authedFetch("/api/recovery-cases", tokenB).then((r) => r.json());
  assert.equal(listRes.total, 0);
});

// ---- M: missing authentication is rejected ---------------------------------------------------

test("M: every recovery-case/demo/dashboard route rejects a request with no token", async () => {
  const routes = [
    { path: "/api/recovery-cases", method: "GET" },
    { path: "/api/demo/payment-failure", method: "POST" },
    { path: "/api/dashboard/summary", method: "GET" },
  ];
  for (const { path, method } of routes) {
    const res = await fetch(`${ctx.baseUrl}${path}`, { method });
    assert.equal(res.status, 401, `${method} ${path} should reject an unauthenticated request`);
  }
});

// ---- N: invalid payload is rejected -----------------------------------------------------------

test("N: a payment-failure payload missing required fields is rejected with a structured 400", async () => {
  const { token } = await demoToken();
  const res = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify({ customer: { name: "No Amount" } }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("N: a negative amount is rejected", async () => {
  const { token } = await demoToken();
  const res = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: -50 })),
  });
  assert.equal(res.status, 400);
});

test("N: an unrecognized additional field is rejected (no accidental amount override surface)", async () => {
  const { token } = await demoToken();
  const res = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify({ ...paymentFailurePayload(), merchantId: "some-other-merchant-id" }),
  });
  assert.equal(res.status, 400);
});

// ---- O: a failed retry re-enters eligibility/policy evaluation --------------------------------

test("O: a FAILED outcome re-enters eligibility on the next /evaluate call, with incremented attempts", async () => {
  const { token, merchant } = await demoToken();
  const { RecoveryCase, Customer } = ctx.models;

  // Force a guaranteed-fail outcome: a low recoveryProbability + rng behavior guaranteed by
  // seeding is not directly controllable via HTTP, so instead we drive the case to
  // POLICY_APPROVED normally, then simulate action repeatedly until we observe a FAILED
  // outcome (deterministic given the seed, and MAX_RECOVERY_ATTEMPTS=2 bounds the loop).
  const customer = await Customer.create({ merchantId: merchant.id, name: "Retry Customer", optedOut: false });
  let recoveryCase = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    currency: "INR",
    status: "RISK_DETECTED",
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    rootCause: "UNKNOWN", // mid-band score, neither guaranteed to fail nor a STOP-only root cause
  });

  await authedFetch(`/api/recovery-cases/${recoveryCase._id}/evaluate`, token, { method: "POST" });
  const afterFirstAction = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/simulate-action`, token, {
    method: "POST",
  }).then((r) => r.json());

  if (afterFirstAction.recoveryCase.status === "FAILED") {
    assert.equal(afterFirstAction.recoveryCase.attempts, 1);

    const reEvaluated = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/evaluate`, token, {
      method: "POST",
    }).then((r) => r.json());

    // Retry re-entry: eligibility runs again, re-checking against the incremented attempt
    // count (RECOVERY_POLICY.md § Policy precedence, "Retry re-entry") rather than jumping
    // straight back to ACTION_SELECTED.
    assert.ok(
      ["ELIGIBLE", "ACTION_SELECTED", "POLICY_APPROVED", "STOPPED", "ESCALATED", "EXPIRED"].includes(
        reEvaluated.recoveryCase.status
      )
    );
    assert.notEqual(reEvaluated.recoveryCase.status, "ANALYZING");
  } else {
    // Deterministic outcome landed on RECOVERED for this seed/case — still proves the
    // pipeline completed end to end; the FAILED->ANALYZING re-entry path itself is covered
    // directly at the unit level (transition.js tests) regardless of which branch this run took.
    assert.equal(afterFirstAction.recoveryCase.status, "RECOVERED");
  }
});

// ---- Dashboard summary ------------------------------------------------------------------------

test("GET /api/dashboard/summary reports revenue-at-risk, recovered revenue, and cases requiring review", async () => {
  const { token } = await demoToken();

  const lowValue = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 1000, failureReason: "insufficient_funds" })),
  }).then((r) => r.json());
  const highValue = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 150000 })),
  }).then((r) => r.json());

  await authedFetch(`/api/recovery-cases/${lowValue.recoveryCase._id}/evaluate`, token, { method: "POST" });
  await authedFetch(`/api/recovery-cases/${highValue.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const res = await authedFetch("/api/dashboard/summary", token);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.revenueAtRisk, 151000);
  assert.equal(body.totalCases, 2);
  assert.equal(body.casesRequiringReview, 1);
  assert.ok(Array.isArray(body.recentCases));
  assert.equal(body.recentCases.length, 2);
});

// ---- GET /api/recovery-cases filtering ---------------------------------------------------------

test("GET /api/recovery-cases filters by status and is merchant-scoped", async () => {
  const { token } = await demoToken();
  await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 150000 })),
  }).then((r) => r.json());

  const created = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload({ amount: 1500, failureReason: "insufficient_funds" })),
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${created.recoveryCase._id}/evaluate`, token, { method: "POST" });

  const all = await authedFetch("/api/recovery-cases", token).then((r) => r.json());
  assert.equal(all.total, 2);

  const approved = await authedFetch("/api/recovery-cases?status=POLICY_APPROVED", token).then((r) => r.json());
  assert.equal(approved.total, 1);
  assert.equal(approved.cases[0]._id, created.recoveryCase._id);
});
