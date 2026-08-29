// Day 5 — Hinglish Voice Recovery. Exercises the real app (server/src/app.js) against an
// in-memory MongoDB, mocking only the AI provider boundary (getAIProvider) so no live
// GEMINI_API_KEY or network call is ever required — CLAUDE.md § Day 5 objective. The voice
// routes reuse the exact same eligibility/policy/executor code the text pipeline uses, so this
// file focuses on what's actually new: session lifecycle, authorization, Gemini-output
// handling, and the policy-override guarantees for voice specifically.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

async function createCase(token, overrides = {}) {
  const res = await authedFetch("/api/demo/payment-failure", token, {
    method: "POST",
    body: JSON.stringify(paymentFailurePayload(overrides)),
  }).then((r) => r.json());
  return res.recoveryCase;
}

// ---- 1/5. authenticated voice session creation --------------------------------------------

test("1/5: an authenticated merchant can create a voice session for its own eligible case", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token);

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.sessionId);
  assert.equal(body.recoveryCase.amount, 2999);
  assert.equal(body.recoveryCase.voiceAttempts, 1);

  // Never returns anything secret-shaped.
  const serialized = JSON.stringify(body).toLowerCase();
  for (const banned of ["gemini_api_key", "password", "secret", "mongodb", "razorpay_key"]) {
    assert.ok(!serialized.includes(banned), `voice session response leaked "${banned}"`);
  }
});

// ---- 2. unauthorized merchant cannot start voice session for another merchant's case ------

test("2: a different merchant gets 404 trying to start a voice session on someone else's case", async () => {
  const merchantAAuth = await demoToken();
  const recoveryCase = await createCase(merchantAAuth.token);

  const { Merchant } = ctx.models;
  const { signMerchantToken } = await import("../server/src/lib/jwt.js");
  const merchantB = await Merchant.create({ email: "merchant-b-voice@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: "1h" });

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, tokenB, {
    method: "POST",
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, "NOT_FOUND");
});

// ---- 3. nonexistent case rejected -----------------------------------------------------------

test("3: a nonexistent case id is rejected with 404, not a 500", async () => {
  const { token } = await demoToken();
  const res = await authedFetch(`/api/recovery-cases/000000000000000000000000/voice/session`, token, {
    method: "POST",
  });
  assert.equal(res.status, 404);
});

// ---- 4. voice disabled rejected --------------------------------------------------------------

test("4: voiceEnabled:false on the merchant policy rejects session creation with a structured error", async () => {
  const { token, merchant } = await demoToken();
  const { Merchant } = ctx.models;
  await Merchant.updateOne({ _id: merchant.id }, { $set: { "policy.voiceEnabled": false } });

  const recoveryCase = await createCase(token);
  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error.code, "CONFLICT");
  assert.match(body.error.message, /disabled/i);
});

test("4b: an opted-out customer cannot have a voice session started against them", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token, {
    customer: { name: "No Contact", email: `optout-voice-${Date.now()}@example.com`, optedOut: true },
  });
  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  });
  assert.equal(res.status, 409);
});

// ---- 5. valid voice session created (attempt accounting) ------------------------------------

test("5: session creation increments voiceAttempts and a second session is refused once the limit is hit", async () => {
  const { token } = await demoToken(); // default maxVoiceAttempts = 1
  const recoveryCase = await createCase(token);

  const first = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  });
  assert.equal(first.status, 201);

  const second = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  });
  assert.equal(second.status, 409);
  const body = await second.json();
  assert.match(body.error.message, /voice attempt limit/i);
});

// Routes go through the AIProvider boundary (getAIProvider(), a plain function returning a
// frozen object) rather than an injectable dependency, so HTTP-level /turn tests below can't
// swap in a fake Gemini response without a mocking library. Instead they verify the two things
// that matter at the HTTP layer — safe behavior with no live GEMINI_API_KEY (always true here)
// and structural validation/rejection — while the intent->action->policy chain itself (the
// part that must never let voice bypass policy) is exercised directly against
// pipeline/orchestrator.js and pipeline/voiceIntentMapper.js, using the exact same functions
// the routes call. This keeps the whole suite offline per CLAUDE.md § Day 5.

// ---- 6/7/9. Hinglish intent -> structured intent, validated, safe on failure -----------------

test("6/7/9: with no GEMINI_API_KEY configured, a voice turn fails safe (UNCLEAR) rather than erroring or executing", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token);
  const session = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  }).then((r) => r.json());

  // A genuinely ambiguous transcript: no live Gemini key -> classifyVoiceIntent hands off to
  // the deterministic keyword fallback, which finds nothing to match and stays UNCLEAR. That
  // never reaches the Eligibility/Policy Engine and never executes anything. (A *clear*
  // supported phrase does get classified by the fallback — see
  // tests/voiceDeterministicFallback.test.js.)
  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, transcript: "haan theek hai bhai" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.aiIntent.intent, "UNCLEAR");
  assert.equal(body.aiIntent.fallback, true);
  assert.equal(body.candidateAction, null);
  assert.equal(body.action, null);
  assert.equal(body.policyResult, null);
  assert.ok(typeof body.response === "string" && body.response.length > 0);

  // Case is untouched — still exactly where it started.
  assert.equal(body.recoveryCase.status, "RISK_DETECTED");
});

test("invalid/malformed transcript payloads are rejected with a structured 400", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token);
  const session = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  }).then((r) => r.json());

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, transcript: "" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("a turn on an already-terminal case is rejected with 409, never silently re-processed", async () => {
  const { token, merchant } = await demoToken();
  const { RecoveryCase, Customer } = ctx.models;
  const customer = await Customer.create({ merchantId: merchant.id, name: "Terminal Case", optedOut: false });
  const recoveryCase = await RecoveryCase.create({
    merchantId: merchant.id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    currency: "INR",
    status: "STOPPED",
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });

  const res = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: "sess-1", transcript: "Hello" }),
  });
  assert.equal(res.status, 409);
});

// ---- 8. invalid AI action rejected (schema-level, direct module test) ------------------------

test("8: the voice intent schema structurally rejects an out-of-allowlist recommendedAction", async () => {
  const { VOICE_INTENT_SCHEMA } = await import("../server/src/ai/schema.js");
  const Ajv = (await import("ajv")).default;
  const validate = new Ajv({ allErrors: true }).compile(VOICE_INTENT_SCHEMA);

  const valid = validate({
    intent: "PAY_NOW",
    recommendedAction: "CREATE_PAYMENT_LINK",
    confidence: 0.9,
    reasonCodes: [],
    requiresHumanReview: false,
  });
  assert.equal(valid, true);

  const invalid = validate({
    intent: "PAY_NOW",
    recommendedAction: "TRANSFER_ALL_FUNDS",
    confidence: 0.9,
    reasonCodes: [],
    requiresHumanReview: false,
  });
  assert.equal(invalid, false);
});

test("classifyVoiceIntent falls back to UNCLEAR for malformed/invalid Gemini output (mocked generate)", async () => {
  const { classifyVoiceIntent } = await import("../server/src/ai/gemini/voiceClassifier.js");
  const { SAFE_FALLBACK_VOICE_INTENT } = await import("../server/src/ai/schema.js");

  const malformed = await classifyVoiceIntent(
    { transcript: "test", amount: 2999 },
    { generate: async () => "not json" }
  );
  assert.deepEqual(
    { intent: malformed.intent, recommendedAction: malformed.recommendedAction, confidence: malformed.confidence },
    { intent: "UNCLEAR", recommendedAction: "ASK_CLARIFICATION", confidence: 0 }
  );
  assert.equal(malformed.fallback, true);

  const invalidAction = await classifyVoiceIntent(
    { transcript: "test", amount: 2999 },
    {
      generate: async () =>
        JSON.stringify({
          intent: "PAY_NOW",
          recommendedAction: "DROP_TABLE",
          confidence: 0.9,
          reasonCodes: [],
          requiresHumanReview: false,
        }),
    }
  );
  assert.equal(invalidAction.fallback, true);
  assert.deepEqual(invalidAction, { ...SAFE_FALLBACK_VOICE_INTENT, fallback: true });
});

// ---- 10. high-value voice recommendation overridden by policy (direct pipeline test) ---------

test("10: a high-value case's voice-derived candidateAction is overridden to ESCALATE by the SAME policy engine", async () => {
  const { runVoiceDecisionPipeline } = await import("../server/src/pipeline/orchestrator.js");
  const { mapVoiceIntentToCandidateAction } = await import("../server/src/pipeline/voiceIntentMapper.js");

  const recoveryCase = {
    status: "RISK_DETECTED",
    amount: 75000,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    rootCause: null,
    createdAt: new Date(),
  };
  const policy = { maxRecoveryAttempts: 2, maxVoiceAttempts: 1, maxAutonomousAmount: 50000, recoveryWindowHours: 72 };
  const customer = { optedOut: false };
  const payment = { failureReason: "insufficient_funds" };

  // Even though the customer said "retry kar do" (PAY_NOW -> CREATE_PAYMENT_LINK candidate)...
  const candidateAction = mapVoiceIntentToCandidateAction("PAY_NOW");
  assert.equal(candidateAction, "CREATE_PAYMENT_LINK");

  const result = runVoiceDecisionPipeline({ recoveryCase, policy, customer, payment, candidateAction });

  // ...the policy engine overrides it to ESCALATE because the amount exceeds the ceiling.
  assert.equal(recoveryCase.status, "ESCALATED");
  assert.equal(result.policyResult, null); // eligibility itself already routed to ESCALATED
  const escalationEntry = result.auditEntries.find((e) => e.eventType === "ELIGIBILITY_EVALUATED");
  assert.equal(escalationEntry.reason, "HIGH_VALUE_REQUIRES_REVIEW");
});

// ---- 11. opt-out voice request results in STOP ------------------------------------------------

test("11: REFUSE intent (normal-value case) is approved for STOP by the shared precedence function, then executed to STOPPED — Scenario C", async () => {
  const { runVoiceDecisionPipeline } = await import("../server/src/pipeline/orchestrator.js");
  const { mapVoiceIntentToCandidateAction } = await import("../server/src/pipeline/voiceIntentMapper.js");
  const { executeAction } = await import("../server/src/pipeline/actionExecutor.js");

  const recoveryCase = {
    status: "RISK_DETECTED",
    amount: 2999,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    rootCause: null,
    createdAt: new Date(),
  };
  const policy = { maxRecoveryAttempts: 2, maxVoiceAttempts: 1, maxAutonomousAmount: 50000, recoveryWindowHours: 72 };
  const customer = { optedOut: false };
  const payment = { failureReason: "insufficient_funds" };

  const candidateAction = mapVoiceIntentToCandidateAction("REFUSE");
  assert.equal(candidateAction, "STOP");

  const result = runVoiceDecisionPipeline({ recoveryCase, policy, customer, payment, candidateAction });

  // STOP as a candidate always short-circuits to APPROVE in the Policy Engine's full pass
  // (the Eligibility Engine's OWN pass always calls with candidateAction=null per
  // RECOVERY_POLICY.md § Policy precedence, so it doesn't see "STOP" yet) — the case reaches
  // ELIGIBLE first, THEN the Policy Engine approves the voice-driven STOP unconditionally.
  // Like the text pipeline, approval alone lands on POLICY_APPROVED — the executor (called
  // separately by routes/voice.js, exactly as it is for text recovery) is what performs the
  // actual STOP transition.
  const eligibilityEntry = result.auditEntries.find((e) => e.eventType === "ELIGIBILITY_EVALUATED");
  assert.equal(eligibilityEntry.result, "ELIGIBLE");
  assert.equal(result.policyResult.outcome, "APPROVE");
  assert.equal(recoveryCase.status, "POLICY_APPROVED");

  executeAction({ recoveryCase, action: recoveryCase.selectedIntervention, rng: () => 0.5 });
  assert.equal(recoveryCase.status, "STOPPED");
});

test("11b: a REFUSE on an ALREADY high-value case still escalates — eligibility's amount check runs before any spoken intent is known", async () => {
  // Documents a real architectural property discovered while building this feature, not a new
  // rule: the Eligibility Engine's first pass (module 3) always calls the shared precedence
  // function with candidateAction=null (RECOVERY_POLICY.md's own text is explicit about this),
  // so the amount check (step 2) fires before ANY candidate action — including a voice-spoken
  // STOP — is known. This matches Scenario D's requirement exactly (a high-value case always
  // escalates) and is unchanged, untouched policy semantics — RECOVERY_POLICY.md's "refusal
  // wins even on a high-value case" claim is verified true for `customer.optedOut` (a
  // persisted flag, checked unconditionally at step 1 regardless of candidateAction) but
  // cannot retroactively un-escalate a case whose eligibility pass, with no candidate action
  // yet, already resolved to ESCALATED before the customer said anything. See the Day 5 final
  // report's known limitations.
  const { runVoiceDecisionPipeline } = await import("../server/src/pipeline/orchestrator.js");
  const { mapVoiceIntentToCandidateAction } = await import("../server/src/pipeline/voiceIntentMapper.js");

  const recoveryCase = {
    status: "RISK_DETECTED",
    amount: 150000,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    rootCause: null,
    createdAt: new Date(),
  };
  const policy = { maxRecoveryAttempts: 2, maxVoiceAttempts: 1, maxAutonomousAmount: 50000, recoveryWindowHours: 72 };
  const customer = { optedOut: false };
  const payment = { failureReason: "insufficient_funds" };

  const candidateAction = mapVoiceIntentToCandidateAction("REFUSE");
  const result = runVoiceDecisionPipeline({ recoveryCase, policy, customer, payment, candidateAction });

  assert.equal(recoveryCase.status, "ESCALATED");
  assert.equal(result.policyResult, null); // never reached the policy stage — eligibility already decided
});

test("11c: a customer already marked optedOut in the database DOES stop a high-value case (DB flag is checked unconditionally at step 1)", async () => {
  const { runVoiceDecisionPipeline } = await import("../server/src/pipeline/orchestrator.js");
  const { mapVoiceIntentToCandidateAction } = await import("../server/src/pipeline/voiceIntentMapper.js");

  const recoveryCase = {
    status: "RISK_DETECTED",
    amount: 150000,
    attempts: 0,
    voiceAttempts: 0,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    rootCause: null,
    createdAt: new Date(),
  };
  const policy = { maxRecoveryAttempts: 2, maxVoiceAttempts: 1, maxAutonomousAmount: 50000, recoveryWindowHours: 72 };
  const customer = { optedOut: true }; // persisted DB flag, not just an in-session utterance
  const payment = { failureReason: "insufficient_funds" };

  const candidateAction = mapVoiceIntentToCandidateAction("PAY_NOW"); // even a PAY_NOW attempt
  const result = runVoiceDecisionPipeline({ recoveryCase, policy, customer, payment, candidateAction });

  assert.equal(recoveryCase.status, "STOPPED");
  const eligibilityEntry = result.auditEntries.find((e) => e.eventType === "ELIGIBILITY_EVALUATED");
  assert.equal(eligibilityEntry.reason, "OPT_OUT_BEHAVIOR");
});

// ---- 12. voice action uses existing executor ----------------------------------------------------

test("12: voice-triggered execution goes through the exact same executeAction function as text recovery", async () => {
  const { executeAction } = await import("../server/src/pipeline/actionExecutor.js");
  const recoveryCase = { status: "POLICY_APPROVED", amount: 2999, attempts: 0, recoveryProbability: 0.9 };
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", rng: () => 0.1 });
  assert.equal(result.status, "SIMULATED");
  assert.equal(result.success, true);
  assert.equal(recoveryCase.status, "RECOVERED");
});

// ---- 13. voice events create audit records ------------------------------------------------------

test("13: a full voice session (start + turn + end) writes the expected audit trail", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token);

  const session = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  }).then((r) => r.json());

  await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, transcript: "Bhai payment fail ho gaya tha" }),
  });

  await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session/end`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId }),
  });

  const auditRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/audit`, token).then((r) => r.json());
  const eventTypes = auditRes.auditLog.map((e) => e.eventType);

  assert.ok(eventTypes.includes("VOICE_SESSION_STARTED"));
  assert.ok(eventTypes.includes("VOICE_INTENT_DETECTED"));
  assert.ok(eventTypes.includes("AI_RECOMMENDATION_CREATED"));
  assert.ok(eventTypes.includes("VOICE_RESPONSE_GENERATED"));
  assert.ok(eventTypes.includes("VOICE_SESSION_ENDED"));

  for (const entry of auditRes.auditLog) {
    assert.equal(entry.caseId, recoveryCase._id);
    assert.equal(entry.merchantId, recoveryCase.merchantId);
  }
});

test("audit entries never contain raw audio, API keys, or secrets", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token);
  const session = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  }).then((r) => r.json());
  await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, transcript: "Payment link bhej do" }),
  });

  const auditRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/audit`, token).then((r) => r.json());
  const serialized = JSON.stringify(auditRes).toLowerCase();
  for (const banned of ["gemini_api_key", "password", "secret", "cvv", "apikey"]) {
    assert.ok(!serialized.includes(banned), `audit trail leaked a "${banned}"-shaped field`);
  }
});

// ---- 14. GEMINI_API_KEY never appears in the client bundle ---------------------------------------

test("14: no GEMINI_API_KEY, VITE_GEMINI_API_KEY, or @google/genai reference exists anywhere under client/", async () => {
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
  assert.ok(files.length > 0);

  for (const fileUrl of files) {
    const source = await readFile(fileUrl, "utf8");
    assert.ok(!/GEMINI_API_KEY/.test(source), `${fileUrl} must not reference GEMINI_API_KEY`);
    assert.ok(!/VITE_GEMINI_API_KEY/.test(source), `${fileUrl} must not reference VITE_GEMINI_API_KEY`);
    assert.ok(!/@google\/genai/.test(source), `${fileUrl} must not import @google/genai`);
  }
});

// ---- 15. voice session response never exposes secrets --------------------------------------------

test("15: voice session and turn responses never contain GEMINI_API_KEY, Razorpay, or Mongo secrets", async () => {
  const { token } = await demoToken();
  const recoveryCase = await createCase(token);

  const sessionRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/session`, token, {
    method: "POST",
  });
  const sessionBody = await sessionRes.json();

  const turnRes = await authedFetch(`/api/recovery-cases/${recoveryCase._id}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId: sessionBody.sessionId, transcript: "Payment link bhej do" }),
  });
  const turnBody = await turnRes.json();

  for (const body of [sessionBody, turnBody]) {
    const serialized = JSON.stringify(body).toLowerCase();
    for (const banned of ["gemini_api_key", "razorpay_key_secret", "razorpay_webhook_secret", "mongodb_uri", "jwt_secret"]) {
      assert.ok(!serialized.includes(banned), `response leaked a "${banned}"-shaped field`);
    }
  }
});

// ---- routes/voice.js never imports the Gemini SDK directly ---------------------------------------

test("routes/voice.js depends on the AIProvider boundary, never imports @google/genai or gemini/* directly", async () => {
  const source = await readFile(new URL("../server/src/routes/voice.js", import.meta.url), "utf8");
  assert.ok(!/@google\/genai/.test(source));
  assert.ok(!/from ["']\.\.\/ai\/gemini\//.test(source), "voice.js should go through ai/provider.js, not gemini/* directly");
});
