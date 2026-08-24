// AGENT_DESIGN.md § The ten modules, module 3 — Recovery Eligibility Engine. Calls the
// shared precedence function (policy/policyPrecedence.js) with candidateAction=null, i.e.
// only steps 0-4 (OPT_OUT -> HIGH_VALUE_AMOUNT_CHECK -> RECOVERY_WINDOW -> ATTEMPT_LIMIT) can
// fire. Only APPROVE() produces ELIGIBLE; every other outcome routes the case straight to a
// terminal-for-this-pass status and scoring/intervention-selection never run for it.

import { evaluatePrecedence } from "../policy/policyPrecedence.js";
import { transition } from "./transition.js";

const OUTCOME_TO_STATUS = {
  STOP: "STOPPED",
  ESCALATE: "ESCALATED",
  EXPIRE: "EXPIRED",
  APPROVE: "ELIGIBLE",
};

/**
 * Mutates recoveryCase.status (via transition()) and recoveryCase.policyDecision.
 * @returns {{outcome: string, reasonCode: string}}
 */
export function evaluateEligibility({ recoveryCase, policy, customer }) {
  const result = evaluatePrecedence(recoveryCase, policy, customer, null);

  const toStatus = OUTCOME_TO_STATUS[result.outcome];
  if (!toStatus) {
    // BLOCK/REJECT are only meaningful once a candidateAction exists (step 5, or the
    // structural allowlist check) — neither can fire with candidateAction=null, so reaching
    // here means the shared precedence function's contract was violated.
    throw new Error(`Unexpected eligibility outcome: ${result.outcome}`);
  }

  transition(recoveryCase, toStatus);
  recoveryCase.policyDecision = result.reasonCode;
  return result;
}
