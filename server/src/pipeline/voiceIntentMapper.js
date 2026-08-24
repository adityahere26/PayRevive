// RECOVERY_POLICY.md § Voice intent -> outcome mapping, implemented as a deterministic lookup
// — NOT the AI's own `recommendedAction` guess. This is what makes it structurally impossible
// for Gemini to pick its own candidate action for execution: the Voice Intent Classifier
// (ai/gemini/voiceClassifier.js) only ever influences the `intent` field, and this pure
// function is the sole place `intent` becomes a candidateAction, which then still has to pass
// through the exact same shared precedence function every other candidate action does
// (policy/policyPrecedence.js).
//
// RECORD_PROMISE_TO_PAY is intentionally not produced here even though PAY_LATER/CANNOT_PAY
// conceptually map to it in RECOVERY_POLICY.md's table — voice-driven promise-to-pay capture
// (recording a spoken date) is not implemented this phase; those intents resolve to ESCALATE
// (human follow-up) instead of a silent no-op or an unsupported action. See AGENT_DESIGN.md §
// Voice pipeline and the Day 5 known limitations.

const INTENT_TO_CANDIDATE_ACTION = {
  PAY_NOW: "CREATE_PAYMENT_LINK",
  PAYMENT_METHOD_PROBLEM: "CREATE_PAYMENT_LINK",
  PAY_LATER: "ESCALATE",
  CANNOT_PAY: "ESCALATE",
  REFUSE: "STOP",
  HUMAN_ESCALATION: "ESCALATE",
  // UNCLEAR has no candidate action — the caller re-asks for clarification and never invokes
  // the Eligibility/Policy Engine for this turn.
  UNCLEAR: null,
};

/** @param {string} intent one of VOICE_INTENTS (ai/schema.js) @returns {string|null} */
export function mapVoiceIntentToCandidateAction(intent) {
  return INTENT_TO_CANDIDATE_ACTION[intent] ?? null;
}
