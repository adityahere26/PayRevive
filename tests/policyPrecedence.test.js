// RECOVERY_POLICY.md § Policy precedence — pure unit tests of the single shared function that
// both the Eligibility Engine and the Policy Engine call. No DB, no HTTP — this is the
// deterministic backbone SECURITY.md § Testing mapping requires to be directly exercised:
// "high-value + expired -> still ESCALATE"; "high-value + refused -> STOP"; "retry never
// skips re-evaluation" (covered in recoveryPipeline.test.js via transition.js instead, since
// that's a state-machine property, not a precedence-function property).

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePrecedence } from "../server/src/policy/policyPrecedence.js";

const POLICY = {
  maxRecoveryAttempts: 2,
  maxVoiceAttempts: 1,
  maxAutonomousAmount: 50000,
  recoveryWindowHours: 72,
};

function makeCase(overrides = {}) {
  return {
    amount: 2999,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    ...overrides,
  };
}

function makeCustomer(overrides = {}) {
  return { optedOut: false, ...overrides };
}

test("a normal, in-window, low-value, first-attempt case is approved", () => {
  const result = evaluatePrecedence(makeCase(), POLICY, makeCustomer(), null);
  assert.equal(result.outcome, "APPROVE");
  assert.equal(result.reasonCode, "APPROVED");
});

test("an opted-out customer with no candidate action produces STOP", () => {
  const result = evaluatePrecedence(makeCase(), POLICY, makeCustomer({ optedOut: true }), null);
  assert.equal(result.outcome, "STOP");
  assert.equal(result.reasonCode, "OPT_OUT_BEHAVIOR");
});

test("STOP is always approved for an opted-out customer, even though nothing else would be", () => {
  const result = evaluatePrecedence(makeCase(), POLICY, makeCustomer({ optedOut: true }), "STOP");
  assert.equal(result.outcome, "APPROVE");
});

test("a high-value case escalates regardless of candidate action", () => {
  const highValueCase = makeCase({ amount: 150000 });
  const result = evaluatePrecedence(highValueCase, POLICY, makeCustomer(), "CREATE_PAYMENT_LINK");
  assert.equal(result.outcome, "ESCALATE");
  assert.equal(result.reasonCode, "HIGH_VALUE_REQUIRES_REVIEW");
});

test("high-value case that has ALSO expired its recovery window still resolves to ESCALATE, not EXPIRED", () => {
  const highValueExpiredCase = makeCase({
    amount: 150000,
    recoveryWindowExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  const result = evaluatePrecedence(highValueExpiredCase, POLICY, makeCustomer(), null);
  assert.equal(result.outcome, "ESCALATE");
  assert.equal(result.reasonCode, "HIGH_VALUE_REQUIRES_REVIEW");
});

test("high-value case that has ALSO exhausted its attempt limit still resolves to ESCALATE, not STOPPED", () => {
  const highValueExhaustedCase = makeCase({ amount: 150000, attempts: 5 });
  const result = evaluatePrecedence(highValueExhaustedCase, POLICY, makeCustomer(), null);
  assert.equal(result.outcome, "ESCALATE");
  assert.equal(result.reasonCode, "HIGH_VALUE_REQUIRES_REVIEW");
});

test("a customer refusal on a high-value case wins over escalation (STOP, not ESCALATE)", () => {
  const highValueCase = makeCase({ amount: 150000 });
  const result = evaluatePrecedence(highValueCase, POLICY, makeCustomer({ optedOut: true }), "STOP");
  assert.equal(result.outcome, "APPROVE");
});

test("an opted-out customer with a high-value case and no candidate action still produces STOP, not ESCALATE", () => {
  const highValueCase = makeCase({ amount: 150000 });
  const result = evaluatePrecedence(highValueCase, POLICY, makeCustomer({ optedOut: true }), null);
  assert.equal(result.outcome, "STOP");
  assert.equal(result.reasonCode, "OPT_OUT_BEHAVIOR");
});

test("an expired recovery window (low-value) produces EXPIRE", () => {
  const expiredCase = makeCase({ recoveryWindowExpiresAt: new Date(Date.now() - 1000) });
  const result = evaluatePrecedence(expiredCase, POLICY, makeCustomer(), null);
  assert.equal(result.outcome, "EXPIRE");
  assert.equal(result.reasonCode, "RECOVERY_WINDOW_EXPIRED");
});

test("attempts at or above the merchant's limit produce STOP with RETRY_LIMIT_REACHED", () => {
  const exhaustedCase = makeCase({ attempts: 2 });
  const result = evaluatePrecedence(exhaustedCase, POLICY, makeCustomer(), null);
  assert.equal(result.outcome, "STOP");
  assert.equal(result.reasonCode, "RETRY_LIMIT_REACHED");
});

test("attempts just below the limit are unaffected by the attempt-limit rule", () => {
  const almostExhaustedCase = makeCase({ attempts: 1 });
  const result = evaluatePrecedence(almostExhaustedCase, POLICY, makeCustomer(), null);
  assert.equal(result.outcome, "APPROVE");
});

test("voice attempts at the merchant's cap block a START_VOICE_RECOVERY candidate", () => {
  const voiceExhaustedCase = makeCase({ voiceAttempts: 1 });
  const result = evaluatePrecedence(voiceExhaustedCase, POLICY, makeCustomer(), "START_VOICE_RECOVERY");
  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.reasonCode, "MAX_VOICE_ATTEMPTS_REACHED");
});

test("an action outside the allowlist is structurally rejected before any business rule runs", () => {
  const result = evaluatePrecedence(makeCase(), POLICY, makeCustomer(), "TRANSFER_ALL_FUNDS");
  assert.equal(result.outcome, "REJECT");
  assert.equal(result.reasonCode, "INVALID_ACTION");
});

test("an invalid action is rejected even for an opted-out customer (structural check runs first)", () => {
  const result = evaluatePrecedence(makeCase(), POLICY, makeCustomer({ optedOut: true }), "NOT_A_REAL_ACTION");
  assert.equal(result.outcome, "REJECT");
});
