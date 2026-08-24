// Pure unit tests for the individual deterministic pipeline modules (AGENT_DESIGN.md § The
// ten modules) that don't need a database: state transitions, root cause lookup, scoring
// formula, intervention selection, eligibility engine, and the simulated action executor.
// No OpenAI, no Razorpay, no HTTP — CLAUDE.md § Day 3 objective ("the system must work
// WITHOUT OpenAI") and EVALUATION.md's determinism principle applied at the unit level.

import { test } from "node:test";
import assert from "node:assert/strict";
import { transition } from "../server/src/pipeline/transition.js";
import { analyzeRootCause } from "../server/src/pipeline/rootCauseAnalyzer.js";
import { calculateRecoveryScore } from "../server/src/pipeline/scoringEngine.js";
import { selectIntervention } from "../server/src/pipeline/interventionSelector.js";
import { evaluateEligibility } from "../server/src/pipeline/eligibilityEngine.js";
import { executeAction } from "../server/src/pipeline/actionExecutor.js";
import { mulberry32, seedFromString } from "../server/src/lib/prng.js";

// ---- transition.js -------------------------------------------------------

test("transition() allows a documented state machine edge", () => {
  const recoveryCase = { status: "RISK_DETECTED" };
  transition(recoveryCase, "ANALYZING");
  assert.equal(recoveryCase.status, "ANALYZING");
});

test("transition() throws on an undocumented edge and leaves status untouched", () => {
  const recoveryCase = { status: "RISK_DETECTED" };
  assert.throws(() => transition(recoveryCase, "RECOVERED"));
  assert.equal(recoveryCase.status, "RISK_DETECTED");
});

test("transition() treats FAILED as non-terminal — its only edge is back to ANALYZING", () => {
  const recoveryCase = { status: "FAILED" };
  assert.throws(() => transition(recoveryCase, "ACTION_SELECTED"));
  transition(recoveryCase, "ANALYZING");
  assert.equal(recoveryCase.status, "ANALYZING");
});

test("transition() rejects any move out of a terminal state", () => {
  for (const terminal of ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"]) {
    const recoveryCase = { status: terminal };
    assert.throws(() => transition(recoveryCase, "ANALYZING"));
  }
});

// ---- rootCauseAnalyzer.js -------------------------------------------------

test("a known retryable Razorpay failure reason maps to RETRYABLE_PAYMENT_FAILURE", () => {
  assert.equal(analyzeRootCause({ failureReason: "insufficient_funds" }), "RETRYABLE_PAYMENT_FAILURE");
});

test("root cause classification is deterministic, not amount-aware — same input, same output", () => {
  const a = analyzeRootCause({ failureReason: "bank_declined" });
  const b = analyzeRootCause({ failureReason: "bank_declined" });
  assert.equal(a, "NON_RETRYABLE_PAYMENT_FAILURE");
  assert.equal(a, b);
});

test("a card-method failure reason maps to CUSTOMER_PAYMENT_METHOD_ISSUE", () => {
  assert.equal(analyzeRootCause({ failureReason: "card_expired" }), "CUSTOMER_PAYMENT_METHOD_ISSUE");
});

test("an unmapped failure reason falls back to UNKNOWN, never guessed", () => {
  assert.equal(analyzeRootCause({ failureReason: "some_new_gateway_code_we_have_never_seen" }), "UNKNOWN");
});

test("no payment / no failure reason also falls back to UNKNOWN", () => {
  assert.equal(analyzeRootCause(null), "UNKNOWN");
  assert.equal(analyzeRootCause({}), "UNKNOWN");
});

test("root cause lookup is case/spacing insensitive against the same underlying reason", () => {
  assert.equal(analyzeRootCause({ failureReason: "Insufficient Funds" }), "RETRYABLE_PAYMENT_FAILURE");
  assert.equal(analyzeRootCause({ failureReason: "INSUFFICIENT-FUNDS" }), "RETRYABLE_PAYMENT_FAILURE");
});

// ---- scoringEngine.js -----------------------------------------------------

const SCORING_POLICY = { recoveryWindowHours: 72 };

test("the reference voice case scores high by construction (RECOVERY_POLICY.md worked example)", () => {
  // RECOVERY_POLICY.md's own worked-example arithmetic (0.30*0.89 + 0.20*1.0 + 0.15*1.0 +
  // 0.15*1.0 + 0.10*0.5 + 0.10*1.0) sums to ~0.917, not the "~0.87" stated in its prose — a
  // documentation arithmetic slip, not a code bug. This asserts against the correct sum of
  // the documented formula/weights, which calculateRecoveryScore implements exactly.
  const recoveryCase = {
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
    attempts: 0,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  };
  const history = {
    prevSuccessfulPayments: 8,
    prevFailedPayments: 0,
    lastActivityAt: new Date(),
    priorRecoverySuccessRate: null,
  };
  const { recoveryProbability, reasonCodes } = calculateRecoveryScore(recoveryCase, history, SCORING_POLICY);
  assert.ok(Math.abs(recoveryProbability - 0.917) < 0.02, `expected ~0.917, got ${recoveryProbability}`);
  assert.ok(reasonCodes.includes("PREVIOUS_SUCCESSFUL_PAYMENTS"));
  assert.ok(reasonCodes.includes("RETRYABLE_FAILURE"));
  assert.ok(reasonCodes.includes("ACTIVE_CUSTOMER"));
  assert.ok(reasonCodes.includes("WITHIN_RECOVERY_WINDOW"));
});

test("a non-retryable failure with no history scores low", () => {
  const recoveryCase = {
    rootCause: "NON_RETRYABLE_PAYMENT_FAILURE",
    attempts: 0,
    createdAt: new Date(),
  };
  const history = {
    prevSuccessfulPayments: 0,
    prevFailedPayments: 0,
    lastActivityAt: null,
    priorRecoverySuccessRate: null,
  };
  const { recoveryProbability } = calculateRecoveryScore(recoveryCase, history, SCORING_POLICY);
  assert.ok(recoveryProbability < 0.4, `expected a low score, got ${recoveryProbability}`);
});

test("score is always clamped to [0, 1]", () => {
  const recoveryCase = { rootCause: "RETRYABLE_PAYMENT_FAILURE", attempts: 0, createdAt: new Date() };
  const history = {
    prevSuccessfulPayments: 1000,
    prevFailedPayments: 0,
    lastActivityAt: new Date(),
    priorRecoverySuccessRate: 1,
  };
  const { recoveryProbability } = calculateRecoveryScore(recoveryCase, history, SCORING_POLICY);
  assert.ok(recoveryProbability <= 1 && recoveryProbability >= 0);
});

test("scoring is deterministic — same inputs always produce the same output", () => {
  const recoveryCase = { rootCause: "CUSTOMER_PAYMENT_METHOD_ISSUE", attempts: 1, createdAt: new Date() };
  const history = {
    prevSuccessfulPayments: 3,
    prevFailedPayments: 1,
    lastActivityAt: new Date(),
    priorRecoverySuccessRate: 0.5,
  };
  const first = calculateRecoveryScore(recoveryCase, history, SCORING_POLICY);
  const second = calculateRecoveryScore(recoveryCase, history, SCORING_POLICY);
  assert.deepEqual(first, second);
});

// ---- interventionSelector.js ----------------------------------------------

test("intervention selection never re-checks amount — same output regardless of amount field", () => {
  const low = selectIntervention({ rootCause: "RETRYABLE_PAYMENT_FAILURE", recoveryProbability: 0.6, amount: 100 });
  const high = selectIntervention({
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
    recoveryProbability: 0.6,
    amount: 999999,
  });
  assert.equal(low, high);
  assert.equal(low, "CREATE_PAYMENT_LINK");
});

test("a non-retryable root cause always selects STOP regardless of score", () => {
  assert.equal(
    selectIntervention({ rootCause: "NON_RETRYABLE_PAYMENT_FAILURE", recoveryProbability: 0.95 }),
    "STOP"
  );
});

test("a customer-declined root cause always selects STOP regardless of score", () => {
  assert.equal(selectIntervention({ rootCause: "CUSTOMER_DECLINED", recoveryProbability: 0.95 }), "STOP");
});

test("a very low recovery probability selects STOP even for a retryable root cause", () => {
  assert.equal(
    selectIntervention({ rootCause: "RETRYABLE_PAYMENT_FAILURE", recoveryProbability: 0.05 }),
    "STOP"
  );
});

test("a mid/high recovery probability selects CREATE_PAYMENT_LINK when voice is disabled (Day 3 default)", () => {
  assert.equal(
    selectIntervention({ rootCause: "RETRYABLE_PAYMENT_FAILURE", recoveryProbability: 0.9 }),
    "CREATE_PAYMENT_LINK"
  );
});

test("intervention selection is deterministic for identical input", () => {
  const input = { rootCause: "RETRYABLE_PAYMENT_FAILURE", recoveryProbability: 0.5 };
  assert.equal(selectIntervention(input), selectIntervention(input));
});

// ---- eligibilityEngine.js --------------------------------------------------

const ELIGIBILITY_POLICY = {
  maxRecoveryAttempts: 2,
  maxVoiceAttempts: 1,
  maxAutonomousAmount: 50000,
  recoveryWindowHours: 72,
};

test("an eligible case transitions from ANALYZING to ELIGIBLE", () => {
  const recoveryCase = {
    status: "ANALYZING",
    amount: 2999,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  };
  const result = evaluateEligibility({ recoveryCase, policy: ELIGIBILITY_POLICY, customer: { optedOut: false } });
  assert.equal(result.outcome, "APPROVE");
  assert.equal(recoveryCase.status, "ELIGIBLE");
  assert.equal(recoveryCase.policyDecision, "APPROVED");
});

test("an opted-out customer's case is stopped by the eligibility engine, never reaches ELIGIBLE", () => {
  const recoveryCase = {
    status: "ANALYZING",
    amount: 2999,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  };
  evaluateEligibility({ recoveryCase, policy: ELIGIBILITY_POLICY, customer: { optedOut: true } });
  assert.equal(recoveryCase.status, "STOPPED");
  assert.equal(recoveryCase.policyDecision, "OPT_OUT_BEHAVIOR");
});

test("a high-value case is escalated by the eligibility engine, before scoring ever runs", () => {
  const recoveryCase = {
    status: "ANALYZING",
    amount: 150000,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  };
  evaluateEligibility({ recoveryCase, policy: ELIGIBILITY_POLICY, customer: { optedOut: false } });
  assert.equal(recoveryCase.status, "ESCALATED");
  assert.equal(recoveryCase.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");
});

test("attempt limit reached is stopped by the eligibility engine", () => {
  const recoveryCase = {
    status: "ANALYZING",
    amount: 2999,
    attempts: 2,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  };
  evaluateEligibility({ recoveryCase, policy: ELIGIBILITY_POLICY, customer: { optedOut: false } });
  assert.equal(recoveryCase.status, "STOPPED");
  assert.equal(recoveryCase.policyDecision, "RETRY_LIMIT_REACHED");
});

test("an expired recovery window is marked EXPIRED by the eligibility engine", () => {
  const recoveryCase = {
    status: "ANALYZING",
    amount: 2999,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() - 1000),
  };
  evaluateEligibility({ recoveryCase, policy: ELIGIBILITY_POLICY, customer: { optedOut: false } });
  assert.equal(recoveryCase.status, "EXPIRED");
  assert.equal(recoveryCase.policyDecision, "RECOVERY_WINDOW_EXPIRED");
});

// ---- actionExecutor.js -----------------------------------------------------

test("simulated executor never imports a Razorpay client (no network capability, comments aside)", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../server/src/pipeline/actionExecutor.js", import.meta.url), "utf8")
  );
  assert.ok(
    !/\b(import|require)\b[^\n]*razorpay/i.test(source),
    "actionExecutor.js must not import/require a Razorpay client"
  );
});

test("executing STOP transitions ACTION_SELECTED-approved case straight to STOPPED, success is null", () => {
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.5 };
  const result = executeAction({ recoveryCase, action: "STOP", rng: () => 0.5 });
  assert.equal(recoveryCase.status, "STOPPED");
  assert.equal(result.status, "SIMULATED");
  assert.equal(result.success, null);
});

test("executing CREATE_PAYMENT_LINK increments attempts and always returns a SIMULATED result", () => {
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.9 };
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", rng: () => 0.1 });
  assert.equal(result.status, "SIMULATED");
  assert.equal(recoveryCase.attempts, 1);
  assert.ok(["RECOVERED", "FAILED"].includes(recoveryCase.status));
});

test("a low rng draw against a high recovery probability simulates success (RECOVERED)", () => {
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.9 };
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", rng: () => 0.1 });
  assert.equal(result.success, true);
  assert.equal(recoveryCase.status, "RECOVERED");
  assert.equal(recoveryCase.recoveredAmount, 2999);
});

test("a high rng draw against a low recovery probability simulates failure (FAILED)", () => {
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.1 };
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", rng: () => 0.9 });
  assert.equal(result.success, false);
  assert.equal(recoveryCase.status, "FAILED");
});

test("the same seed always produces the same simulated outcome (deterministic, not Math.random)", () => {
  const seed = seedFromString("case123:0");
  const caseA = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.5 };
  const caseB = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.5 };
  const resultA = executeAction({ recoveryCase: caseA, action: "CREATE_PAYMENT_LINK", rng: mulberry32(seed) });
  const resultB = executeAction({ recoveryCase: caseB, action: "CREATE_PAYMENT_LINK", rng: mulberry32(seed) });
  assert.equal(resultA.success, resultB.success);
});

test("the executor refuses to run without a POLICY_APPROVED-consistent transition (defensive: STOP from wrong status throws)", () => {
  const recoveryCase = { status: "ELIGIBLE", amount: 2999, attempts: 0 };
  assert.throws(() => executeAction({ recoveryCase, action: "STOP", rng: () => 0.5 }));
});
