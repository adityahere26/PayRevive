// Focused tests for server/src/ai/gemini/responseGenerator.js's speechText addition (voice
// pronunciation quality fix). No live GEMINI_API_KEY or network call required — every test
// injects `generate` directly or exercises the deterministic fallback templates, matching the
// existing offline-test convention (tests/aiProvider.test.js, tests/voiceRecovery.test.js).
//
// The core guarantee under test: speechText and responseText always describe the SAME trusted
// outcome. Whenever Gemini can't be trusted (missing/malformed/invalid output), BOTH fields
// come from the same deterministic per-status template — never a Gemini-generated field paired
// with a fallback field, and never a fallback that misrepresents success/failure.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateVoiceResponse,
  clarificationResponse,
} from "../server/src/ai/gemini/responseGenerator.js";

const SUCCESS_WORDS = /success|recover(ed)?|सफल|तैयार है और (?:भेज|काम)/i;
const FAILURE_WORDS = /fail|nahi hua|nahi kar paye|nahi ho paya|नहीं\s*(?:हुआ|पाए|पाया|कर पाए)/i;

function jsonGenerate(payload) {
  return async () => JSON.stringify(payload);
}

// ---- valid structured response schema ------------------------------------------------------

test("a valid Gemini response with both responseText and speechText is accepted as-is", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "RECOVERED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
    {
      generate: jsonGenerate({
        responseText: "Aapka payment ho gaya hai.",
        speechText: "आपका पेमेंट हो गया है।",
      }),
    }
  );
  assert.equal(result.fallback, false);
  assert.equal(result.responseText, "Aapka payment ho gaya hai.");
  assert.equal(result.speechText, "आपका पेमेंट हो गया है।");
});

test("a Gemini response missing speechText is rejected and falls back to the deterministic bilingual template", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "RECOVERED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
    { generate: jsonGenerate({ responseText: "Aapka payment ho gaya hai." }) } // no speechText
  );
  assert.equal(result.fallback, true);
  assert.ok(result.responseText.length > 0);
  assert.ok(result.speechText.length > 0);
});

test("a Gemini response with an empty-string speechText is rejected and falls back", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "RECOVERED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
    { generate: jsonGenerate({ responseText: "Aapka payment ho gaya hai.", speechText: "" }) }
  );
  assert.equal(result.fallback, true);
});

test("malformed (non-JSON) Gemini output falls back to the deterministic bilingual template", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "FAILED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
    { generate: async () => "not json at all {{{" }
  );
  assert.equal(result.fallback, true);
  assert.ok(result.speechText.length > 0);
});

test("a Gemini/network failure falls back to the deterministic bilingual template, never throws", async () => {
  await assert.doesNotReject(async () => {
    const result = await generateVoiceResponse(
      { amount: 2999, caseStatus: "FAILED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
      {
        generate: async () => {
          throw new Error("Gemini request timed out after 10000ms");
        },
      }
    );
    assert.equal(result.fallback, true);
  });
});

// ---- successful recovery speech ---------------------------------------------------------------

test("successful recovery (RECOVERED) fallback speechText is Devanagari and honestly claims success", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "RECOVERED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
    { generate: async () => { throw new Error("simulated Gemini outage"); } }
  );
  assert.equal(result.fallback, true);
  assert.match(result.speechText, /[ऀ-ॿ]/, "speechText should contain Devanagari script");
  assert.match(result.speechText, SUCCESS_WORDS);
  assert.doesNotMatch(result.speechText, FAILURE_WORDS);
});

// ---- failed recovery speech ---------------------------------------------------------------------

test("failed recovery (FAILED) fallback speechText is Devanagari, honest about failure, and never claims success", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "FAILED", policyDecision: "APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK" },
    { generate: async () => { throw new Error("simulated Gemini outage"); } }
  );
  assert.equal(result.fallback, true);
  assert.match(result.speechText, /[ऀ-ॿ]/, "speechText should contain Devanagari script");
  assert.match(result.speechText, FAILURE_WORDS);
  assert.doesNotMatch(result.speechText, /सफलतापूर्वक|successfully/i);
});

// ---- policy rejection speech (high-value escalation) ---------------------------------------------

test("policy rejection (HIGH_VALUE_REQUIRES_REVIEW) fallback speechText reflects escalation, not execution", async () => {
  const result = await generateVoiceResponse(
    {
      amount: 150000,
      caseStatus: "ESCALATED",
      policyDecision: "HIGH_VALUE_REQUIRES_REVIEW",
      selectedIntervention: null,
    },
    { generate: async () => { throw new Error("simulated Gemini outage"); } }
  );
  assert.equal(result.fallback, true);
  assert.match(result.speechText, /[ऀ-ॿ]/);
  assert.match(result.speechText, /रिव्यू|review/i);
  assert.doesNotMatch(result.speechText, SUCCESS_WORDS);
});

test("policy rejection (OPT_OUT_BEHAVIOR) fallback speechText reflects a stop, never claims an action executed", async () => {
  const result = await generateVoiceResponse(
    { amount: 2999, caseStatus: "STOPPED", policyDecision: "OPT_OUT_BEHAVIOR", selectedIntervention: "STOP" },
    { generate: async () => { throw new Error("simulated Gemini outage"); } }
  );
  assert.equal(result.fallback, true);
  assert.doesNotMatch(result.speechText, SUCCESS_WORDS);
  assert.doesNotMatch(result.speechText, /payment link|पेमेंट लिंक/i);
});

// ---- speechText never falsely claims success across every fallback template ----------------------

test("no fallback template for a non-success outcome ever contains success-claiming Devanagari or Hinglish wording", async () => {
  const nonSuccessCases = [
    { caseStatus: "FAILED", policyDecision: null, selectedIntervention: "CREATE_PAYMENT_LINK" },
    { caseStatus: "STOPPED", policyDecision: null, selectedIntervention: "STOP" },
    { caseStatus: "ESCALATED", policyDecision: "HIGH_VALUE_REQUIRES_REVIEW", selectedIntervention: null },
    { caseStatus: "ESCALATED", policyDecision: null, selectedIntervention: "ESCALATE" },
    { caseStatus: "EXPIRED", policyDecision: "RECOVERY_WINDOW_EXPIRED", selectedIntervention: null },
    { caseStatus: "STOPPED", policyDecision: "OPT_OUT_BEHAVIOR", selectedIntervention: "STOP" },
    { caseStatus: "STOPPED", policyDecision: "RETRY_LIMIT_REACHED", selectedIntervention: null },
  ];

  for (const decisionContext of nonSuccessCases) {
    const result = await generateVoiceResponse(
      { amount: 2999, ...decisionContext },
      { generate: async () => { throw new Error("simulated outage"); } }
    );
    assert.doesNotMatch(
      result.speechText,
      /सफलतापूर्वक हो गया|successfully recover|payment (?:done|successful)/i,
      `speechText for ${JSON.stringify(decisionContext)} falsely implies success: "${result.speechText}"`
    );
  }
});

// ---- clarification (UNCLEAR) ------------------------------------------------------------------------

test("clarificationResponse() returns a Devanagari speechText alongside the Roman responseText, no Gemini call", () => {
  const result = clarificationResponse();
  assert.equal(result.fallback, true);
  assert.match(result.speechText, /[ऀ-ॿ]/);
  assert.ok(result.responseText.length > 0);
});
