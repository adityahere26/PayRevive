// Voice channel — the deterministic keyword fallback used when the Gemini intent classifier
// is unavailable (server/src/pipeline/deterministicVoiceIntent.js, wired into
// ai/gemini/voiceClassifier.js). The test harness never has a GEMINI_API_KEY, so every
// /voice/turn here exercises the fallback path.
//
// The guarantees under test:
//   - a clearly-worded supported request is understood (not stuck on UNCLEAR) and flows
//     through the SAME voiceIntentMapper + Eligibility/Policy Engine as always;
//   - a genuinely ambiguous / unsupported request still gets the clarification ask;
//   - the fallback classifier NEVER bypasses policy and NEVER makes a customer-facing call:
//     an opted-out customer still resolves to STOPPED with no action, and with no Razorpay
//     configured a payment link is never created.

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
  return fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }).then((r) => r.json());
}
function authed(path, token, opts = {}) {
  return fetch(`${ctx.baseUrl}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}
async function newCase(token, { customer = {}, amount = 2999 } = {}) {
  const body = {
    customer: { name: "Priya", email: `p-${Date.now()}-${Math.random()}@ex.com`, ...customer },
    amount,
    currency: "INR",
    failureReason: "insufficient_funds",
  };
  const res = await authed("/api/demo/payment-failure", token, { method: "POST", body: JSON.stringify(body) }).then((r) =>
    r.json()
  );
  return res.recoveryCase;
}
async function startSession(token, caseId) {
  return authed(`/api/recovery-cases/${caseId}/voice/session`, token, { method: "POST" }).then((r) => r.json());
}
async function turn(token, caseId, sessionId, transcript) {
  const res = await authed(`/api/recovery-cases/${caseId}/voice/turn`, token, {
    method: "POST",
    body: JSON.stringify({ sessionId, transcript }),
  });
  return { status: res.status, body: await res.json() };
}

// ---- 1. clear payment-retry request → understood, flows through the real pipeline ----------

test("1: a clear retry request is classified (PAY_NOW) and advances the case through the policy engine", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { status, body } = await turn(token, rc._id, session.sessionId, "Bhai payment fail ho gaya tha, ek baar phir try karwa do");

  assert.equal(status, 200);
  assert.equal(body.aiIntent.intent, "PAY_NOW");
  assert.equal(body.aiIntent.fallback, true); // no Gemini key → deterministic fallback
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK");
  assert.ok(body.policyResult, "the policy engine actually ran");
  assert.notEqual(body.recoveryCase.status, "RISK_DETECTED", "the case advanced past the raw detected state");
  assert.ok(!/samajh nahi/i.test(body.response), "not the clarification reply");
});

// ---- 2. clear payment-link request → CREATE_PAYMENT_LINK candidate ------------------------

test("2: a clear 'payment link bhej do' request maps to the CREATE_PAYMENT_LINK candidate action", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "Customer ko payment link bhej do");

  assert.ok(["PAYMENT_METHOD_PROBLEM", "PAY_NOW"].includes(body.aiIntent.intent));
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK");
  assert.ok(body.policyResult);
});

// ---- 3. genuinely ambiguous request → still asks for clarification -----------------------

test("3: an ambiguous transcript stays UNCLEAR — clarification ask, no candidate action, case untouched", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { status, body } = await turn(token, rc._id, session.sessionId, "haan theek hai bhai");

  assert.equal(status, 200);
  assert.equal(body.aiIntent.intent, "UNCLEAR");
  assert.equal(body.candidateAction, null);
  assert.equal(body.action, null);
  assert.equal(body.policyResult, null);
  assert.equal(body.recoveryCase.status, "RISK_DETECTED");
  assert.match(body.response, /samajh nahi/i);
});

// ---- 4. unsupported request → UNCLEAR ---------------------------------------------------

test("4: an unsupported request (nothing to do with payment) stays UNCLEAR", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "mujhe pizza order karna hai");

  assert.equal(body.aiIntent.intent, "UNCLEAR");
  assert.equal(body.candidateAction, null);
  assert.equal(body.recoveryCase.status, "RISK_DETECTED");
});

// ---- 5. Gemini unavailable → deterministic fallback used, recorded as a fallback ----------

test("5: with Gemini unavailable the turn still works and is audited as a deterministic fallback", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  await turn(token, rc._id, session.sessionId, "dobara payment karwa do");

  const audit = await authed(`/api/recovery-cases/${rc._id}/audit`, token).then((r) => r.json());
  const intentEvent = audit.auditLog.find((e) => e.eventType === "VOICE_INTENT_DETECTED");
  assert.ok(intentEvent);
  assert.equal(intentEvent.result, "FALLBACK");
  assert.equal(intentEvent.metadata.fallback, true);
});

// ---- 6. Gemini available → the real classification is used, NOT the keyword fallback -------

test("6: when Gemini answers, its classification is used verbatim (keyword fallback not consulted)", async () => {
  const { classifyVoiceIntent } = await import("../server/src/ai/gemini/voiceClassifier.js");
  // A transcript the keyword classifier would call PAY_NOW, but "Gemini" returns CANNOT_PAY.
  const out = await classifyVoiceIntent(
    { transcript: "dobara payment karwa do", amount: 2999 },
    {
      generate: async () =>
        JSON.stringify({
          intent: "CANNOT_PAY",
          recommendedAction: "ESCALATE",
          confidence: 0.91,
          reasonCodes: ["MODEL"],
          requiresHumanReview: false,
        }),
    }
  );
  assert.equal(out.intent, "CANNOT_PAY");
  assert.equal(out.fallback, false);
  assert.equal(out.confidence, 0.91);
});

// ---- 7. policy safety: a clear PAY_NOW candidate is still overridden by the policy engine --
//        (high-value case above the merchant's autonomous limit → ESCALATED, nothing executes)

test("7: a clear PAY_NOW candidate on a high-value case is overridden to ESCALATED by policy — no action executes", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token, { amount: 74999 }); // > default maxAutonomousAmount (50000)
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "abhi pay karna hai, dobara try karwa do");

  assert.equal(body.aiIntent.intent, "PAY_NOW");
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK"); // candidate proposed…
  assert.equal(body.recoveryCase.status, "ESCALATED"); // …but the shared policy engine overrides it
  assert.equal(body.action, null, "nothing executed by the fallback classifier");
  assert.equal(body.paymentLink, null, "no payment link created");
});

// ---- 8. merchant/policy-eligible case → approved by the SAME engine, no live Razorpay call -

test("8: a clear PAY_NOW from an eligible customer is APPROVED by policy; with no Razorpay no real link is created", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "haan bhai abhi payment kar do, phir try karwa do");

  assert.equal(body.aiIntent.intent, "PAY_NOW");
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK");
  assert.equal(body.policyResult.outcome, "APPROVE");
  // No Razorpay configured in the test env → the existing simulated executor runs in-turn
  // (same path POST /:id/simulate-action uses); it is clearly SIMULATED and never a live call.
  assert.equal(body.paymentLink, null);
  if (body.action) assert.equal(body.action.status, "SIMULATED");
  assert.ok(["POLICY_APPROVED", "RECOVERED", "FAILED"].includes(body.recoveryCase.status));
});

// ---- 9-12. Devanagari transcripts flow through the exact same fallback + pipeline ---------

test("9: a Devanagari retry request is classified PAY_NOW and advances the case", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { status, body } = await turn(
    token,
    rc._id,
    session.sessionId,
    "भाई पेमेंट फेल हो गया था एक बार फिर ट्राई करवा दो"
  );

  assert.equal(status, 200);
  assert.equal(body.aiIntent.intent, "PAY_NOW");
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK");
  assert.ok(body.policyResult);
  assert.notEqual(body.recoveryCase.status, "RISK_DETECTED");
  assert.ok(!/samajh nahi/i.test(body.response));
});

test("10: a Devanagari 'payment link bhej do' maps to the CREATE_PAYMENT_LINK candidate", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "पेमेंट लिंक भेज दो");

  assert.ok(["PAYMENT_METHOD_PROBLEM", "PAY_NOW"].includes(body.aiIntent.intent));
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK");
});

test("11: 'दूसरे कार्ड से पेमेंट करना है' is PAYMENT_METHOD_PROBLEM, not a refusal or UNCLEAR", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "दूसरे कार्ड से पेमेंट करना है");

  assert.equal(body.aiIntent.intent, "PAYMENT_METHOD_PROBLEM");
  assert.equal(body.candidateAction, "CREATE_PAYMENT_LINK");
});

// ---- 12-13. negation wins — Latin and Devanagari — and REFUSE never executes anything -----

// STOP/ESCALATE "execution" is just the terminal state transition (no customer contact, no
// payment link, never a fabricated success) — that is the existing voice behaviour, unchanged.
function assertNoCustomerFacingRecovery(body) {
  assert.equal(body.paymentLink, null, "no payment link");
  if (body.action) {
    assert.notEqual(body.action.success, true, "never a fabricated success");
    assert.ok(["STOP", "ESCALATE"].includes(body.action.action), "only the terminal STOP/ESCALATE transition");
  }
}

test("12: 'abhi payment nahi karna' is REFUSE (not PAY_NOW) and the case is STOPPED — no customer-facing recovery", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "abhi payment nahi karna");

  assert.equal(body.aiIntent.intent, "REFUSE");
  assert.equal(body.candidateAction, "STOP");
  assert.equal(body.recoveryCase.status, "STOPPED");
  assertNoCustomerFacingRecovery(body);
});

test("13: 'अभी पेमेंट नहीं करना है' is REFUSE (not PAY_NOW) and the case is STOPPED — no customer-facing recovery", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "अभी पेमेंट नहीं करना है");

  assert.equal(body.aiIntent.intent, "REFUSE");
  assert.notEqual(body.aiIntent.intent, "PAY_NOW");
  assert.equal(body.recoveryCase.status, "STOPPED");
  assertNoCustomerFacingRecovery(body);
});

// ---- 14. a Devanagari ambiguous transcript still asks for clarification -------------------

test("14: an ambiguous Devanagari-ish transcript stays UNCLEAR", async () => {
  const { token } = await demoToken();
  const rc = await newCase(token);
  const session = await startSession(token, rc._id);
  const { body } = await turn(token, rc._id, session.sessionId, "हाँ ठीक है भाई");

  assert.equal(body.aiIntent.intent, "UNCLEAR");
  assert.equal(body.candidateAction, null);
  assert.equal(body.recoveryCase.status, "RISK_DETECTED");
});
