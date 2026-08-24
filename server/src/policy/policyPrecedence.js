// RECOVERY_POLICY.md § Policy precedence — the single shared, ordered function used by BOTH
// the Eligibility Engine (pipeline/eligibilityEngine.js, steps 0-4, candidateAction=null) and
// the Policy Engine (policy/policyEngine.js, full steps 0-5, final gate before execution).
// This is what makes it structurally impossible for a high-value case to be silently resolved
// as EXPIRED/STOPPED by one stage while the other would have escalated it — see
// AGENT_DESIGN.md § HIGH_VALUE ownership.
//
// Order (do not reorder without updating RECOVERY_POLICY.md first):
//   0. structural action-allowlist check
//   1. OPT_OUT (an explicit STOP is always approved and always wins, even over high-value)
//   2. HIGH_VALUE_AMOUNT_CHECK (before window/attempts, on purpose)
//   3. RECOVERY_WINDOW
//   4. ATTEMPT_LIMIT
//   5. other action-specific rules (only meaningful once candidateAction is set)

export const ACTION_ALLOWLIST = [
  "CREATE_PAYMENT_LINK",
  "START_VOICE_RECOVERY",
  "RECORD_PROMISE_TO_PAY",
  "ESCALATE",
  "STOP",
];

/**
 * @returns {{outcome: "REJECT"|"STOP"|"ESCALATE"|"EXPIRE"|"BLOCK"|"APPROVE", reasonCode: string}}
 */
export function evaluatePrecedence(recoveryCase, policy, customer, candidateAction = null) {
  // 0. structural — always first, not a business rule
  if (candidateAction !== null && !ACTION_ALLOWLIST.includes(candidateAction)) {
    return { outcome: "REJECT", reasonCode: "INVALID_ACTION" };
  }

  // 1. OPT_OUT — only STOP is ever approved for an opted-out customer; stopping is always
  // safe and is never blocked by anything below, which is what lets an explicit customer
  // refusal win over a high-value escalation.
  if (customer.optedOut && candidateAction !== "STOP") {
    return { outcome: "STOP", reasonCode: "OPT_OUT_BEHAVIOR" };
  }
  if (candidateAction === "STOP") {
    return { outcome: "APPROVE", reasonCode: "APPROVED" };
  }

  // 2. HIGH_VALUE_AMOUNT_CHECK — evaluated before window/attempts, on purpose. No autonomous
  // action executes for this case regardless of how much window remains or how many attempts
  // have been made.
  if (recoveryCase.amount > policy.maxAutonomousAmount) {
    return { outcome: "ESCALATE", reasonCode: "HIGH_VALUE_REQUIRES_REVIEW" };
  }

  // 3. RECOVERY_WINDOW
  if (Date.now() > new Date(recoveryCase.recoveryWindowExpiresAt).getTime()) {
    return { outcome: "EXPIRE", reasonCode: "RECOVERY_WINDOW_EXPIRED" };
  }

  // 4. ATTEMPT_LIMIT
  if (recoveryCase.attempts >= policy.maxRecoveryAttempts) {
    return { outcome: "STOP", reasonCode: "RETRY_LIMIT_REACHED" };
  }

  // 5. OTHER POLICY RULES — action-specific, only meaningful once a candidate action exists.
  // The Eligibility Engine's first pass runs with candidateAction=null and never reaches
  // here with anything but APPROVE.
  if (candidateAction === "START_VOICE_RECOVERY" && recoveryCase.voiceAttempts >= policy.maxVoiceAttempts) {
    return { outcome: "BLOCK", reasonCode: "MAX_VOICE_ATTEMPTS_REACHED" };
  }

  return { outcome: "APPROVE", reasonCode: "APPROVED" };
}
