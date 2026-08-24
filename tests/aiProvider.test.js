// Tests for the Gemini provider boundary (server/src/ai/) introduced by the OpenAI → Gemini
// migration. AGENT_DESIGN.md § Provider abstraction. No live GEMINI_API_KEY or network call is
// required anywhere in this file — the provider's `generate` function is always injected as a
// mock, per CLAUDE.md's testing principles and the migration task's explicit requirement that
// deterministic/unit tests never depend on a live Gemini API key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { planRecoveryDecision, buildRecoveryPrompt } from "../server/src/ai/gemini/planner.js";
import { AI_DECISION_SCHEMA, AI_RECOMMENDED_ACTIONS, SAFE_FALLBACK_DECISION } from "../server/src/ai/schema.js";
import { getAIProvider } from "../server/src/ai/provider.js";
import { ACTION_ALLOWLIST } from "../server/src/policy/policyPrecedence.js";
import { evaluatePolicy } from "../server/src/policy/policyEngine.js";
import { evaluatePrecedence } from "../server/src/policy/policyPrecedence.js";
import { executeAction } from "../server/src/pipeline/actionExecutor.js";

const POLICY = {
  maxRecoveryAttempts: 2,
  maxVoiceAttempts: 1,
  maxAutonomousAmount: 50000,
  recoveryWindowHours: 72,
};

function makeCase(overrides = {}) {
  return {
    status: "ACTION_SELECTED",
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

function jsonGenerate(payload) {
  return async () => JSON.stringify(payload);
}

// ---- 1. Gemini provider can be initialized from GEMINI_API_KEY ----------------------------

test("1: getAIProvider() returns a Gemini-backed provider without requiring a live API key", () => {
  const provider = getAIProvider();
  assert.equal(provider.name, "gemini");
  assert.equal(typeof provider.planRecoveryDecision, "function");
});

// ---- 2. missing GEMINI_API_KEY is handled correctly ----------------------------------------

test("2: a missing/unconfigured API key surfaces as a normal thrown error the planner can catch", async () => {
  const generate = async () => {
    throw new Error("GEMINI_API_KEY is not configured");
  };
  const decision = await planRecoveryDecision(makeCase(), { generate });
  assert.deepEqual(decision, { ...SAFE_FALLBACK_DECISION, fallback: true });
});

// ---- 3. planner returns validated structured decision ---------------------------------------

test("3: a valid Gemini response is parsed, validated, and returned with fallback:false", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: jsonGenerate({
      recommendedAction: "CREATE_PAYMENT_LINK",
      reason: "Customer payment method appears recoverable",
      confidence: 0.91,
    }),
  });
  assert.equal(decision.recommendedAction, "CREATE_PAYMENT_LINK");
  assert.equal(decision.confidence, 0.91);
  assert.equal(decision.fallback, false);
});

// ---- 4. invalid AI action is rejected --------------------------------------------------------

test("4: a recommendedAction outside the allowlist is rejected and falls back safely", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: jsonGenerate({
      recommendedAction: "TRANSFER_ALL_FUNDS",
      reason: "nope",
      confidence: 0.99,
    }),
  });
  assert.equal(decision.fallback, true);
  assert.equal(decision.recommendedAction, "ESCALATE");
});

// ---- 5. malformed AI output is rejected -------------------------------------------------------

test("5: non-JSON output from Gemini is rejected and falls back safely", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: async () => "this is not json at all {{{",
  });
  assert.equal(decision.fallback, true);
  assert.deepEqual(
    { recommendedAction: decision.recommendedAction, reason: decision.reason, confidence: decision.confidence },
    SAFE_FALLBACK_DECISION
  );
});

test("5b: JSON missing a required field is rejected and falls back safely", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: jsonGenerate({ recommendedAction: "STOP" }), // missing reason, confidence
  });
  assert.equal(decision.fallback, true);
});

test("5c: an out-of-range confidence value is rejected and falls back safely", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: jsonGenerate({ recommendedAction: "STOP", reason: "x", confidence: 42 }),
  });
  assert.equal(decision.fallback, true);
});

// ---- 6. Gemini timeout/failure produces safe fallback ------------------------------------------

test("6: a rejected generate promise (timeout/network failure) produces the safe fallback, never throws", async () => {
  const generate = async () => {
    throw new Error("Gemini request timed out after 10000ms");
  };
  await assert.doesNotReject(async () => {
    const decision = await planRecoveryDecision(makeCase(), { generate });
    assert.equal(decision.fallback, true);
  });
});

// ---- 7. high-value policy overrides Gemini recommendation --------------------------------------

test("7: policy engine overrides a Gemini CREATE_PAYMENT_LINK recommendation to ESCALATE for a high-value case", async () => {
  const highValueCase = makeCase({ amount: 150000, status: "ACTION_SELECTED" });
  const decision = await planRecoveryDecision(highValueCase, {
    generate: jsonGenerate({
      recommendedAction: "CREATE_PAYMENT_LINK",
      reason: "Looks recoverable",
      confidence: 0.9,
    }),
  });
  assert.equal(decision.recommendedAction, "CREATE_PAYMENT_LINK"); // the AI's raw recommendation

  const result = evaluatePolicy({
    recoveryCase: highValueCase,
    policy: POLICY,
    customer: makeCustomer(),
    candidateAction: decision.recommendedAction,
  });
  assert.equal(result.outcome, "ESCALATE");
  assert.equal(result.reasonCode, "HIGH_VALUE_REQUIRES_REVIEW");
  assert.equal(highValueCase.status, "ESCALATED");
});

// ---- 8. opt-out overrides Gemini recommendation -------------------------------------------------

test("8: policy engine overrides a Gemini CREATE_PAYMENT_LINK recommendation to STOP for an opted-out customer", async () => {
  const optedOutCase = makeCase({ status: "ACTION_SELECTED" });
  const decision = await planRecoveryDecision(optedOutCase, {
    generate: jsonGenerate({
      recommendedAction: "CREATE_PAYMENT_LINK",
      reason: "Customer seems reachable",
      confidence: 0.8,
    }),
  });

  const result = evaluatePrecedence(optedOutCase, POLICY, makeCustomer({ optedOut: true }), decision.recommendedAction);
  assert.equal(result.outcome, "STOP");
  assert.equal(result.reasonCode, "OPT_OUT_BEHAVIOR");
});

// ---- 9. invalid Gemini recommendation cannot execute ---------------------------------------------

test("9: an invalid recommendation never reaches the executor — the planner sanitizes it to ESCALATE first", async () => {
  const recoveryCase = makeCase({ status: "POLICY_APPROVED" });
  const decision = await planRecoveryDecision(recoveryCase, {
    generate: jsonGenerate({ recommendedAction: "DROP_DATABASE", reason: "x", confidence: 1 }),
  });
  assert.equal(decision.recommendedAction, "ESCALATE");
  assert.ok(AI_RECOMMENDED_ACTIONS.includes(decision.recommendedAction));

  // Even if a caller fed the raw (rejected) model output straight to the executor, the
  // structural allowlist check in the shared precedence function would reject it before the
  // executor ever runs — this is the second, independent layer of defense.
  const structuralCheck = evaluatePrecedence(recoveryCase, POLICY, makeCustomer(), "DROP_DATABASE");
  assert.equal(structuralCheck.outcome, "REJECT");
  assert.equal(structuralCheck.reasonCode, "INVALID_ACTION");

  // The executor itself only ever runs on the planner's sanitized decision, which resolves to
  // a supported action (ESCALATE):
  const executed = executeAction({ recoveryCase, action: decision.recommendedAction, rng: () => 0.5 });
  assert.equal(executed.status, "SIMULATED");
  assert.equal(recoveryCase.status, "ESCALATED");
});

// ---- 10. Gemini cannot bypass merchant authorization ----------------------------------------------

test("10: the returned decision object contains ONLY recommendedAction/reason/confidence/fallback — nothing an authorization check could be tricked by", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: jsonGenerate({
      recommendedAction: "ESCALATE",
      reason: "test",
      confidence: 0.5,
      // an adversarial/malformed response trying to smuggle extra fields
      merchantId: "attacker-controlled-merchant-id",
      amount: 1,
      customerId: "attacker-controlled-customer-id",
    }),
  });
  // additionalProperties:false rejects this whole payload outright (extra fields are invalid
  // per AI_DECISION_SCHEMA), so it falls back rather than smuggling anything through.
  assert.equal(decision.fallback, true);
  assert.deepEqual(Object.keys(decision).sort(), ["confidence", "fallback", "reason", "recommendedAction"]);
});

test("10b: a schema-valid decision never carries merchantId/customerId/caseId fields even when present in the raw payload", async () => {
  const decision = await planRecoveryDecision(makeCase(), {
    generate: async () =>
      JSON.stringify({
        recommendedAction: "STOP",
        reason: "test",
        confidence: 0.5,
        merchantId: "should-be-stripped-by-additionalProperties-false",
      }),
  });
  // Still rejected by additionalProperties:false → falls back; either way, no merchantId leaks.
  assert.equal("merchantId" in decision, false);
});

// ---- 11. Gemini is never given Razorpay secrets --------------------------------------------------

test("11: buildRecoveryPrompt only reads an explicit safe-field allowlist — adversarial extra context fields never appear in the prompt", () => {
  const adversarialContext = {
    amount: 2999,
    currency: "INR",
    rootCause: "RETRYABLE_PAYMENT_FAILURE",
    failureReason: "insufficient_funds",
    customerName: "Priya Sharma",
    attempts: 0,
    maxRecoveryAttempts: 2,
    recoveryProbability: 0.65,
    eligibilityReasonCode: "APPROVED",
    // fields that must NEVER appear in a Gemini prompt:
    razorpayKeySecret: "rzp_test_should_never_leak_1234567890",
    razorpayWebhookSecret: "whsec_should_never_leak_abcdef",
    jwtSecret: "should_never_leak_jwt_secret",
    mongodbUri: "mongodb+srv://user:should_never_leak@cluster/db",
    cardNumber: "4111111111111111",
    cvv: "123",
  };

  const prompt = buildRecoveryPrompt(adversarialContext);

  for (const secretValue of [
    adversarialContext.razorpayKeySecret,
    adversarialContext.razorpayWebhookSecret,
    adversarialContext.jwtSecret,
    adversarialContext.mongodbUri,
    adversarialContext.cardNumber,
    adversarialContext.cvv,
  ]) {
    assert.ok(!prompt.includes(secretValue), `prompt leaked a secret-shaped value: ${secretValue}`);
  }
  // Sanity: the safe fields ARE present, proving this isn't just an empty prompt.
  assert.ok(prompt.includes("2999"));
  assert.ok(prompt.includes("RETRYABLE_PAYMENT_FAILURE"));
});

test("11b: the Gemini client wrapper is the ONLY module that imports @google/genai", async () => {
  const files = [
    "../server/src/ai/provider.js",
    "../server/src/ai/schema.js",
    "../server/src/ai/gemini/planner.js",
  ];
  for (const relPath of files) {
    const source = await readFile(new URL(relPath, import.meta.url), "utf8");
    assert.ok(!/@google\/genai/.test(source), `${relPath} must not import @google/genai directly`);
  }
  const clientSource = await readFile(
    new URL("../server/src/ai/gemini/client.js", import.meta.url),
    "utf8"
  );
  assert.ok(/@google\/genai/.test(clientSource), "gemini/client.js should be the one file that imports the SDK");
});

// ---- 12. Gemini is never called from the client (frontend) ----------------------------------------

test("12: no GEMINI_API_KEY, VITE_GEMINI_API_KEY, or @google/genai reference exists anywhere under client/", async () => {
  const { readdir } = await import("node:fs/promises");
  const clientSrcUrl = new URL("../client/src/", import.meta.url);

  async function collectFiles(dirUrl) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dirUrl);
      if (entry.isDirectory()) {
        files.push(...(await collectFiles(entryUrl)));
      } else if (/\.(js|jsx)$/.test(entry.name)) {
        files.push(entryUrl);
      }
    }
    return files;
  }

  const files = await collectFiles(clientSrcUrl);
  assert.ok(files.length > 0, "expected to find client source files to scan");

  for (const fileUrl of files) {
    const source = await readFile(fileUrl, "utf8");
    assert.ok(!/GEMINI_API_KEY/.test(source), `${fileUrl} must not reference GEMINI_API_KEY`);
    assert.ok(!/VITE_GEMINI_API_KEY/.test(source), `${fileUrl} must not reference VITE_GEMINI_API_KEY`);
    assert.ok(!/@google\/genai/.test(source), `${fileUrl} must not import @google/genai`);
  }
});

// ---- schema sanity: recommendedAction enum matches the deterministic action allowlist -------------

test("AI_DECISION_SCHEMA's recommendedAction enum is exactly ACTION_ALLOWLIST plus ASK_CLARIFICATION", () => {
  const expected = [...ACTION_ALLOWLIST, "ASK_CLARIFICATION"].sort();
  assert.deepEqual([...AI_DECISION_SCHEMA.properties.recommendedAction.enum].sort(), expected);
  assert.deepEqual([...AI_RECOMMENDED_ACTIONS].sort(), expected);
});

test("AI_DECISION_SCHEMA rejects additional properties (structural defense against field smuggling)", () => {
  assert.equal(AI_DECISION_SCHEMA.additionalProperties, false);
});
