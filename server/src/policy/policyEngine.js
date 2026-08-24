// AGENT_DESIGN.md § The ten modules, module 6 — Policy Engine. Re-runs the same shared
// precedence function (policyPrecedence.js) — now with the candidate action, exercising step
// 5 as well — as the final authoritative gate immediately before ACTION_EXECUTED. Re-running
// steps 1-4 here is not redundant: time has passed since the Eligibility Engine's first pass
// (the window could have expired, or on a retry the attempt count just incremented), so this
// is what makes the "high-value always escalates" guarantee hold on every path, not just the
// first one. CLAUDE.md core principle #2: "The AI never bypasses the policy engine. Any
// AI-recommended action is advisory until the policy engine approves it" — this is that gate.

import { evaluatePrecedence } from "./policyPrecedence.js";
import { transition } from "../pipeline/transition.js";

const OUTCOME_TO_STATUS = {
  STOP: "STOPPED",
  ESCALATE: "ESCALATED",
  EXPIRE: "EXPIRED",
  // BLOCK (e.g. MAX_VOICE_ATTEMPTS_REACHED) has no distinct terminal status of its own — the
  // candidate action is simply not approved, which is the same observable outcome as STOP.
  BLOCK: "STOPPED",
  APPROVE: "POLICY_APPROVED",
};

/**
 * @param {{recoveryCase: object, policy: object, customer: object, candidateAction: string}} args
 * @returns {{outcome: string, reasonCode: string}}
 */
export function evaluatePolicy({ recoveryCase, policy, customer, candidateAction }) {
  const result = evaluatePrecedence(recoveryCase, policy, customer, candidateAction);

  if (result.outcome === "REJECT") {
    // Structural: candidateAction wasn't in ACTION_ALLOWLIST. The Intervention Selector only
    // ever proposes allowlisted actions, so reaching here means a caller passed something it
    // shouldn't have — fail loudly rather than silently approving or guessing a status.
    throw new Error(`Policy Engine rejected an invalid candidate action: ${candidateAction}`);
  }

  transition(recoveryCase, OUTCOME_TO_STATUS[result.outcome]);
  recoveryCase.policyDecision = result.reasonCode;
  return result;
}
