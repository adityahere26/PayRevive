// Deterministic orchestration of modules 2, 3, 4, 5, 6 (AGENT_DESIGN.md § The ten modules) —
// plain function calls in a fixed sequence, per ARCHITECTURE.md § System overview ("the
// recovery pipeline is deterministic orchestration: plain function calls in sequence"). This
// is the sole business-logic core behind POST /api/recovery-cases/:id/evaluate — no HTTP or
// AI concerns live here, satisfying CLAUDE.md's definition of done ("deterministic, testable
// core, business logic isolated from HTTP/AI plumbing").
//
// Re-entrant by construction: a case can only progress from RISK_DETECTED, ANALYZING, or
// FAILED (retry re-entry — RECOVERY_POLICY.md § Policy precedence "Retry re-entry"); calling
// this again on a case already past that point (ELIGIBLE and beyond) is a safe no-op, because
// the pipeline runs ANALYZING -> {ELIGIBLE -> ACTION_SELECTED -> POLICY_APPROVED}/terminal
// entirely within one call — there's no reachable state where a case is left sitting in
// ANALYZING or ELIGIBLE waiting for a second /evaluate call.

import { transition } from "./transition.js";
import { analyzeRootCause } from "./rootCauseAnalyzer.js";
import { evaluateEligibility } from "./eligibilityEngine.js";
import { calculateRecoveryScore } from "./scoringEngine.js";
import { selectIntervention } from "./interventionSelector.js";
import { evaluatePolicy } from "../policy/policyEngine.js";

/**
 * @param {{recoveryCase: object, policy: object, customer: object, payment: object|null, history: object}} args
 * @returns {{recoveryCase: object, auditEntries: Array<{eventType: string, reason: string|null, result: string|null, metadata: object}>}}
 */
export function runEvaluationPipeline({ recoveryCase, policy, customer, payment, history }) {
  const auditEntries = [];

  if (recoveryCase.status === "FAILED" || recoveryCase.status === "RISK_DETECTED") {
    transition(recoveryCase, "ANALYZING");
  }

  if (recoveryCase.status !== "ANALYZING") {
    // Already past this phase (ELIGIBLE/ACTION_SELECTED/POLICY_APPROVED or terminal) —
    // nothing left for this pipeline pass to do.
    return { recoveryCase, auditEntries };
  }

  if (!recoveryCase.rootCause) {
    recoveryCase.rootCause = analyzeRootCause(payment);
    auditEntries.push({
      eventType: "ROOT_CAUSE_IDENTIFIED",
      reason: null,
      result: recoveryCase.rootCause,
      metadata: { paymentId: payment?._id ?? null },
    });
  }

  const eligibility = evaluateEligibility({ recoveryCase, policy, customer });
  auditEntries.push({
    eventType: "ELIGIBILITY_EVALUATED",
    reason: eligibility.reasonCode,
    result: recoveryCase.status,
    metadata: {},
  });

  if (recoveryCase.status !== "ELIGIBLE") {
    // Eligibility routed the case straight to STOPPED/ESCALATED/EXPIRED — scoring and
    // intervention selection never run for a case whose fate is already decided.
    return { recoveryCase, auditEntries };
  }

  const { recoveryProbability, reasonCodes } = calculateRecoveryScore(recoveryCase, history, policy);
  recoveryCase.recoveryProbability = recoveryProbability;
  recoveryCase.reasonCodes = reasonCodes;
  auditEntries.push({
    eventType: "RECOVERY_SCORED",
    reason: null,
    result: recoveryProbability.toFixed(2),
    metadata: { reasonCodes },
  });

  const candidateAction = selectIntervention(recoveryCase);
  transition(recoveryCase, "ACTION_SELECTED");
  recoveryCase.selectedIntervention = candidateAction;
  auditEntries.push({
    eventType: "INTERVENTION_SELECTED",
    reason: null,
    result: candidateAction,
    metadata: {},
  });

  const policyResult = evaluatePolicy({ recoveryCase, policy, customer, candidateAction });
  auditEntries.push({
    eventType: "POLICY_EVALUATED",
    reason: policyResult.reasonCode,
    result: recoveryCase.status,
    metadata: { candidateAction },
  });

  return { recoveryCase, auditEntries };
}
