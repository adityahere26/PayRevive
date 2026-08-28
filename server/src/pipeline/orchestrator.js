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
import { explainRecoveryDecision } from "./decisionRationale.js";

// Attaches the plain-language decision rationale to the case and records it as an audit entry.
// Purely descriptive — see pipeline/decisionRationale.js. Called at every point a pass reaches
// a decided state (routed to a terminal by eligibility, or after the Policy Engine's gate).
function explain(recoveryCase, policy, auditEntries) {
  const rationale = explainRecoveryDecision({ recoveryCase, policy });
  if (!rationale) return;
  recoveryCase.decisionRationale = rationale;
  auditEntries.push({
    eventType: "DECISION_EXPLAINED",
    reason: null,
    result: rationale.headline,
    metadata: { outcome: rationale.outcome, proposed: rationale.proposed },
  });
}

/**
 * @param {{recoveryCase: object, policy: object, customer: object, payment: object|null, history: object, interventionOptions?: {voiceEnabled?: boolean}}} args
 * @returns {{recoveryCase: object, auditEntries: Array<{eventType: string, reason: string|null, result: string|null, metadata: object}>}}
 */
export function runEvaluationPipeline({ recoveryCase, policy, customer, payment, history, interventionOptions = {} }) {
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
    explain(recoveryCase, policy, auditEntries);
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

  // interventionOptions.voiceEnabled is threaded straight from merchant.policy.voiceEnabled by
  // the recovery-plan builder (pipeline/recoveryPlan.js). The default {} preserves the
  // pre-existing behavior for every other caller (the /evaluate route, unit tests): voice stays
  // off and the >=0.75 band falls through to CREATE_PAYMENT_LINK. Whatever is returned is still
  // only a *candidate* — evaluatePolicy below has final say, and no customer-facing action runs
  // until the merchant confirms the plan.
  const candidateAction = selectIntervention(recoveryCase, interventionOptions);
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

  explain(recoveryCase, policy, auditEntries);

  return { recoveryCase, auditEntries };
}

// AGENT_DESIGN.md § Voice pipeline / migration task "the voice experience must use the SAME
// recovery/policy pipeline as text-based recovery." This is deliberately NOT a parallel
// re-implementation of runEvaluationPipeline: it calls the exact same evaluateEligibility and
// evaluatePolicy functions above, from the exact same policy/policyPrecedence.js module. The
// only difference from the text flow is where `candidateAction` comes from — here it's
// supplied by the caller (routes/voice.js, via pipeline/voiceIntentMapper.js's deterministic
// intent->action lookup) instead of being computed by the recovery-score-based
// interventionSelector.js. This is exactly what the Policy Engine (module 6) is designed to
// gate: ANY candidate action, regardless of source, still passes through the full shared
// precedence function before anything executes.
//
// Like runEvaluationPipeline, this only progresses a case from RISK_DETECTED, ANALYZING,
// FAILED, or ELIGIBLE — routes/voice.js is responsible for refusing to start a new voice
// session on a case already past ELIGIBLE (ACTION_SELECTED/POLICY_APPROVED/terminal), so this
// function is never asked to arbitrate a case mid-flight through some other channel.
/**
 * @param {{recoveryCase: object, policy: object, customer: object, payment: object|null, candidateAction: string}} args
 * @returns {{recoveryCase: object, auditEntries: Array<object>, policyResult: {outcome: string, reasonCode: string}|null}}
 */
export function runVoiceDecisionPipeline({ recoveryCase, policy, customer, payment, candidateAction }) {
  const auditEntries = [];

  if (recoveryCase.status === "FAILED" || recoveryCase.status === "RISK_DETECTED") {
    transition(recoveryCase, "ANALYZING");
  }

  if (recoveryCase.status === "ANALYZING") {
    if (!recoveryCase.rootCause) {
      recoveryCase.rootCause = analyzeRootCause(payment);
      auditEntries.push({
        eventType: "ROOT_CAUSE_IDENTIFIED",
        reason: null,
        result: recoveryCase.rootCause,
        metadata: { paymentId: payment?._id ?? null, source: "VOICE" },
      });
    }

    const eligibility = evaluateEligibility({ recoveryCase, policy, customer });
    auditEntries.push({
      eventType: "ELIGIBILITY_EVALUATED",
      reason: eligibility.reasonCode,
      result: recoveryCase.status,
      metadata: { source: "VOICE" },
    });

    if (recoveryCase.status !== "ELIGIBLE") {
      // Routed straight to STOPPED/ESCALATED/EXPIRED — the case's fate is already decided;
      // the voice-supplied candidateAction is never consulted.
      explain(recoveryCase, policy, auditEntries);
      return { recoveryCase, auditEntries, policyResult: null };
    }
  }

  if (recoveryCase.status === "ELIGIBLE") {
    recoveryCase.selectedIntervention = candidateAction;
    transition(recoveryCase, "ACTION_SELECTED");
    auditEntries.push({
      eventType: "INTERVENTION_SELECTED",
      reason: null,
      result: candidateAction,
      metadata: { source: "VOICE" },
    });
  }

  if (recoveryCase.status !== "ACTION_SELECTED") {
    return { recoveryCase, auditEntries, policyResult: null };
  }

  const policyResult = evaluatePolicy({ recoveryCase, policy, customer, candidateAction });
  auditEntries.push({
    eventType: "POLICY_EVALUATED",
    reason: policyResult.reasonCode,
    result: recoveryCase.status,
    metadata: { candidateAction, source: "VOICE" },
  });

  explain(recoveryCase, policy, auditEntries);

  return { recoveryCase, auditEntries, policyResult };
}
