// pipeline/decisionRationale.js — turns the recovery pipeline's already-computed outputs into
// one plain-language sentence + a factor list for the case-detail UI. Pure function, no server
// or DB needed. It only DESCRIBES a decision; these tests assert the wording, not any policy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { explainRecoveryDecision } from "../server/src/pipeline/decisionRationale.js";

const POLICY = { maxAutonomousAmount: 50000, maxRecoveryAttempts: 2, recoveryWindowHours: 72 };

test("1: voice-band proposal, policy APPROVED → 'Queued for your approval' with a reason", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "RETRYABLE_PAYMENT_FAILURE",
      recoveryProbability: 0.88,
      reasonCodes: ["PREVIOUS_SUCCESSFUL_PAYMENTS", "RETRYABLE_FAILURE"],
      selectedIntervention: "START_VOICE_RECOVERY",
      policyDecision: "APPROVED",
      amount: 8750,
    },
    policy: POLICY,
  });
  assert.equal(r.proposed, "Voice recovery call");
  assert.equal(r.outcome, "Queued for your approval");
  assert.match(r.headline, /voice recovery call/i);
  assert.ok(r.factors.length >= 2);
  assert.equal(r.factors[0].label, "Strong payment history");
});

test("2: link-band proposal, policy APPROVED", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "CUSTOMER_PAYMENT_METHOD_ISSUE",
      recoveryProbability: 0.52,
      reasonCodes: ["WITHIN_RECOVERY_WINDOW"],
      selectedIntervention: "CREATE_PAYMENT_LINK",
      policyDecision: "APPROVED",
      amount: 2999,
    },
    policy: POLICY,
  });
  assert.equal(r.proposed, "Payment link");
  assert.equal(r.outcome, "Queued for your approval");
  assert.match(r.headline, /payment link/i);
});

test("3: STOP for a non-retryable decline → 'no viable recovery', not contacting", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "NON_RETRYABLE_PAYMENT_FAILURE",
      recoveryProbability: 0.08,
      reasonCodes: [],
      selectedIntervention: "STOP",
      policyDecision: "APPROVED",
      amount: 4000,
    },
    policy: POLICY,
  });
  assert.equal(r.outcome, "Stopped — no viable recovery");
  assert.match(r.headline, /not contacting the customer/i);
});

test("4: high-value → proposed a link, but escalated; headline names both amounts", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "RETRYABLE_PAYMENT_FAILURE",
      recoveryProbability: null, // eligibility caught it before scoring
      reasonCodes: [],
      selectedIntervention: null,
      policyDecision: "HIGH_VALUE_REQUIRES_REVIEW",
      amount: 74999,
    },
    policy: POLICY,
  });
  assert.equal(r.outcome, "Escalated for your review");
  assert.match(r.headline, /₹74,999/);
  assert.match(r.headline, /₹50,000/);
  assert.match(r.headline, /escalated/i);
});

test("5: opt-out → stopped, and the wording says it overrides everything", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "RETRYABLE_PAYMENT_FAILURE",
      selectedIntervention: null,
      policyDecision: "OPT_OUT_BEHAVIOR",
      amount: 2450,
    },
    policy: POLICY,
  });
  assert.equal(r.outcome, "Stopped — customer opted out");
  assert.match(r.headline, /opted out/i);
  assert.match(r.headline, /overrides/i);
});

test("6: expired window → headline names the merchant's window length", () => {
  const r = explainRecoveryDecision({
    recoveryCase: { rootCause: "UNKNOWN", policyDecision: "RECOVERY_WINDOW_EXPIRED", amount: 3300 },
    policy: POLICY,
  });
  assert.equal(r.outcome, "Expired — outside the recovery window");
  assert.match(r.headline, /72-hour/);
});

test("7: retry limit → headline names the allowed attempt count", () => {
  const r = explainRecoveryDecision({
    recoveryCase: { rootCause: "RETRYABLE_PAYMENT_FAILURE", policyDecision: "RETRY_LIMIT_REACHED", amount: 1500 },
    policy: POLICY,
  });
  assert.equal(r.outcome, "Stopped — retry limit reached");
  assert.match(r.headline, /2 recovery attempts/);
});

test("8: MAX_VOICE_ATTEMPTS_REACHED → voice blocked wording", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "RETRYABLE_PAYMENT_FAILURE",
      recoveryProbability: 0.9,
      reasonCodes: ["PREVIOUS_SUCCESSFUL_PAYMENTS"],
      selectedIntervention: "START_VOICE_RECOVERY",
      policyDecision: "MAX_VOICE_ATTEMPTS_REACHED",
      amount: 6000,
    },
    policy: POLICY,
  });
  assert.equal(r.outcome, "Voice blocked — attempt limit reached");
  assert.match(r.headline, /no call was placed/i);
});

test("9: an un-evaluated / degenerate case returns null and never throws", () => {
  assert.equal(explainRecoveryDecision({ recoveryCase: {}, policy: POLICY }), null);
  assert.equal(explainRecoveryDecision({ recoveryCase: { rootCause: "UNKNOWN" }, policy: {} }), null);
  assert.equal(explainRecoveryDecision({}), null);
});

test("10: every headline is a single trimmed sentence ending in a period", () => {
  const r = explainRecoveryDecision({
    recoveryCase: {
      rootCause: "RETRYABLE_PAYMENT_FAILURE",
      recoveryProbability: 0.7,
      reasonCodes: ["RETRYABLE_FAILURE"],
      selectedIntervention: "CREATE_PAYMENT_LINK",
      policyDecision: "APPROVED",
      amount: 3200,
    },
    policy: POLICY,
  });
  assert.equal(r.headline, r.headline.trim());
  assert.ok(r.headline.endsWith("."));
  assert.ok(!r.headline.includes("\n"));
});
