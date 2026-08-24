// AGENT_DESIGN.md § AI output contract. Provider-agnostic: this is the structured-decision
// shape every AI Decision/Planner in this system must produce, validated independently of
// whatever schema enforcement the provider's own API offers (currently Gemini's
// responseSchema/responseMimeType) — "defense in depth, not trust" per AGENT_DESIGN.md.
//
// recommendedAction is restricted to the SAME allowlist the deterministic Policy Engine
// enforces (policy/policyPrecedence.js's ACTION_ALLOWLIST), plus ASK_CLARIFICATION — a
// non-executable "no action, ask again" signal that is never passed to the Policy Engine as a
// candidateAction. This is what makes it structurally impossible for the model to invent a
// novel action string: the schema's `enum` is the same list the executor already trusts.

import { ACTION_ALLOWLIST } from "../policy/policyPrecedence.js";

export const AI_RECOMMENDED_ACTIONS = Object.freeze([...ACTION_ALLOWLIST, "ASK_CLARIFICATION"]);

export const AI_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendedAction", "reason", "confidence"],
  properties: {
    recommendedAction: { type: "string", enum: AI_RECOMMENDED_ACTIONS },
    reason: { type: "string", minLength: 1, maxLength: 500 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

// Returned whenever the AI provider is unavailable, times out, or returns anything that
// fails schema validation — CLAUDE.md core principle #2 ("the AI never bypasses the policy
// engine") applied to failure modes too: an AI failure must never silently become "no
// decision" that some caller could misinterpret as an approval. ESCALATE is always a safe
// terminal candidate — the shared precedence function (policy/policyPrecedence.js) either
// approves it outright or upgrades it further (e.g. an opted-out customer still resolves to
// STOP), but it can never result in an unreviewed autonomous action.
export const SAFE_FALLBACK_DECISION = Object.freeze({
  recommendedAction: "ESCALATE",
  reason: "AI_PLANNER_UNAVAILABLE_OR_INVALID",
  confidence: 0,
});

// AGENT_DESIGN.md § AI output contract — the Voice Intent Classifier's exact documented
// shape (module 8). `recommendedAction` here is ADVISORY ONLY: it is never trusted as the
// candidateAction fed to the Policy Engine — pipeline/voiceIntentMapper.js deterministically
// re-derives the real candidate action from `intent` per RECOVERY_POLICY.md § Voice intent ->
// outcome mapping, so the model's own action guess can never be the thing that executes.
export const VOICE_INTENTS = Object.freeze([
  "PAY_NOW",
  "PAY_LATER",
  "PAYMENT_METHOD_PROBLEM",
  "CANNOT_PAY",
  "REFUSE",
  "UNCLEAR",
  "HUMAN_ESCALATION",
]);

export const VOICE_INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "recommendedAction", "confidence", "reasonCodes", "requiresHumanReview"],
  properties: {
    intent: { type: "string", enum: VOICE_INTENTS },
    recommendedAction: { type: "string", enum: AI_RECOMMENDED_ACTIONS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasonCodes: { type: "array", items: { type: "string", maxLength: 100 }, maxItems: 10 },
    requiresHumanReview: { type: "boolean" },
  },
};

// Any field outside the enumerated values, missing required fields, or malformed JSON is a
// hard reject — the session falls back to UNCLEAR and asks the customer to repeat/clarify, it
// never guesses (AGENT_DESIGN.md § AI output contract).
export const SAFE_FALLBACK_VOICE_INTENT = Object.freeze({
  intent: "UNCLEAR",
  recommendedAction: "ASK_CLARIFICATION",
  confidence: 0,
  reasonCodes: Object.freeze(["AI_PLANNER_UNAVAILABLE_OR_INVALID"]),
  requiresHumanReview: false,
});
