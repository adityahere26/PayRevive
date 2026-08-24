// Day 6 — pure-function unit tests, no DB/HTTP/network involved. Fast, isolated coverage for
// the three lowest-level building blocks: signature verification, the executor's new live
// branch, and outcome resolution.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpaySignature } from "../server/src/integrations/razorpay/webhookVerify.js";
import { executeAction } from "../server/src/pipeline/actionExecutor.js";
import { resolveRecoveryOutcome } from "../server/src/pipeline/outcomeEvaluator.js";

// ---- webhook signature verification --------------------------------------------------------

test("verifyRazorpaySignature: accepts a correctly computed HMAC-SHA256 signature", () => {
  const body = JSON.stringify({ event: "payment_link.paid" });
  const secret = "test-secret";
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyRazorpaySignature(body, signature, secret), true);
});

test("verifyRazorpaySignature: rejects a tampered body", () => {
  const body = JSON.stringify({ event: "payment_link.paid" });
  const secret = "test-secret";
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const tamperedBody = JSON.stringify({ event: "payment_link.paid", amount: 999999999 });
  assert.equal(verifyRazorpaySignature(tamperedBody, signature, secret), false);
});

test("verifyRazorpaySignature: rejects a signature computed with the wrong secret", () => {
  const body = JSON.stringify({ event: "payment_link.paid" });
  const signature = crypto.createHmac("sha256", "wrong-secret").update(body).digest("hex");
  assert.equal(verifyRazorpaySignature(body, signature, "correct-secret"), false);
});

test("verifyRazorpaySignature: rejects when any input is missing", () => {
  assert.equal(verifyRazorpaySignature("", "sig", "secret"), false);
  assert.equal(verifyRazorpaySignature("body", undefined, "secret"), false);
  assert.equal(verifyRazorpaySignature("body", "sig", ""), false);
});

test("verifyRazorpaySignature: rejects a different-length signature without throwing", () => {
  assert.doesNotThrow(() => {
    assert.equal(verifyRazorpaySignature("body", "short", "secret"), false);
  });
});

// ---- actionExecutor live branch -------------------------------------------------------------

test("executeAction: live CREATE_PAYMENT_LINK moves to WAITING_OUTCOME and never resolves an outcome or sets recoveredAmount", () => {
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveredAmount: 0 };
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", live: true });

  assert.equal(result.status, "LIVE_TEST_MODE");
  assert.equal(result.success, null);
  assert.equal(recoveryCase.status, "WAITING_OUTCOME");
  assert.equal(recoveryCase.attempts, 1);
  assert.equal(recoveryCase.recoveredAmount, 0); // never fabricated
});

test("executeAction: omitting `live` (existing callers) is byte-identical to pre-Day-6 behavior", () => {
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.9 };
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", rng: () => 0.1 });
  assert.equal(result.status, "SIMULATED");
  assert.equal(result.success, true);
  assert.equal(recoveryCase.status, "RECOVERED");
  assert.equal(recoveryCase.recoveredAmount, 2999);
});

// ---- outcomeEvaluator -------------------------------------------------------------------------

test("resolveRecoveryOutcome: RECOVERED sets recoveredAmount from the case's own amount", () => {
  const recoveryCase = { status: "WAITING_OUTCOME", amount: 2999, recoveredAmount: 0 };
  const result = resolveRecoveryOutcome({ recoveryCase, outcome: "RECOVERED" });
  assert.equal(result.applied, true);
  assert.equal(recoveryCase.status, "RECOVERED");
  assert.equal(recoveryCase.recoveredAmount, 2999);
});

test("resolveRecoveryOutcome: FAILED never touches recoveredAmount", () => {
  const recoveryCase = { status: "WAITING_OUTCOME", amount: 2999, recoveredAmount: 0 };
  const result = resolveRecoveryOutcome({ recoveryCase, outcome: "FAILED" });
  assert.equal(result.applied, true);
  assert.equal(recoveryCase.status, "FAILED");
  assert.equal(recoveryCase.recoveredAmount, 0);
});

test("resolveRecoveryOutcome: idempotent — a case no longer WAITING_OUTCOME is left untouched (no double-resolution)", () => {
  const recoveryCase = { status: "RECOVERED", amount: 2999, recoveredAmount: 2999 };
  const result = resolveRecoveryOutcome({ recoveryCase, outcome: "RECOVERED" });
  assert.equal(result.applied, false);
  assert.equal(recoveryCase.recoveredAmount, 2999); // not double-counted
});
