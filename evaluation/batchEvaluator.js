// EVALUATION.md § Batch evaluation engine. Runs the SAME production decision pipeline
// (server/src/pipeline) used by POST /api/recovery-cases/:id/evaluate and
// POST /api/recovery-cases/:id/simulate-action against a seeded synthetic dataset
// (datasetGenerator.js) — never a re-implementation of the decision logic. Every external
// call (Gemini, Razorpay, a real voice session) is out of reach by construction: the
// pipeline functions imported here are the pure/deterministic ones, and the executor is the
// same simulated (seeded-RNG) path every non-live single-case caller already uses — see
// server/src/pipeline/actionExecutor.js's own comment on this being the unchanged path.
//
// Cases are plain in-memory objects, not persisted RecoveryCase/AuditLog documents — this
// keeps evaluation runs from ever being able to leak into the live dashboard's
// merchant-scoped aggregates (CLAUDE.md core principle #6: simulated/synthetic results must
// never be presented as real activity). Only the aggregate run (server/src/models/
// EvaluationRun.js, unmodified schema) is persisted, scoped by merchantId like everything
// else.

import { runEvaluationPipeline } from "../server/src/pipeline/orchestrator.js";
import { executeAction } from "../server/src/pipeline/actionExecutor.js";
import { mulberry32, seedFromString } from "../server/src/lib/prng.js";
import { generateSyntheticCases } from "./datasetGenerator.js";

const HOUR_MS = 60 * 60 * 1000;

function buildRecoveryCaseInput(caseSeed, policy) {
  const createdAt = new Date(Date.now() - caseSeed.createdAtOffsetHours * HOUR_MS);
  return {
    _id: `EVAL-${caseSeed.index}`,
    amount: caseSeed.amount,
    currency: "INR",
    sourceType: caseSeed.sourceType,
    status: "RISK_DETECTED",
    rootCause: caseSeed.presetRootCause || null,
    recoveryProbability: null,
    reasonCodes: [],
    selectedIntervention: null,
    policyDecision: null,
    attempts: caseSeed.attemptsAtStart,
    voiceAttempts: 0,
    recoveredAmount: 0,
    createdAt,
    recoveryWindowExpiresAt: new Date(createdAt.getTime() + policy.recoveryWindowHours * HOUR_MS),
  };
}

function aggregateMetrics(results) {
  const totalCases = results.length;
  const sum = (list, fn) => list.reduce((acc, r) => acc + fn(r), 0);

  const eligibleCases = results.filter((r) => r.recoveryProbability != null);
  const eligibleRevenue = sum(eligibleCases, (r) => r.amount);
  // "actions executed" per EVALUATION.md's Metrics table = non-STOP actions actually
  // executed (STOP is executed too, via the same Action Executor call, but isn't a revenue
  // recovery attempt).
  const actionsExecuted = results.filter((r) => r.executed && r.selectedIntervention !== "STOP").length;
  // Every case where the Policy Engine actually reached APPROVE for its candidate action
  // (STOP included — a STOP candidate is approved and executed too, see actionExecutor.js).
  const approvedCases = results.filter((r) => r.executed).length;
  const recoveredCases = results.filter((r) => r.status === "RECOVERED");
  const escalatedCases = results.filter((r) => r.status === "ESCALATED");
  const stoppedCases = results.filter((r) => r.status === "STOPPED");
  const expiredCases = results.filter((r) => r.status === "EXPIRED");
  const failedCases = results.filter((r) => r.status === "FAILED");
  const recoveredRevenue = sum(recoveredCases, (r) => r.recoveredAmount);
  const recoveryAttempts = sum(results, (r) => r.attempts);
  const eligibleRevenueSafe = eligibleRevenue > 0 ? eligibleRevenue : 0;

  const recoveryByIntervention = {};
  for (const r of results) {
    const key = r.selectedIntervention || "NONE";
    if (!recoveryByIntervention[key]) {
      recoveryByIntervention[key] = { count: 0, revenue: 0, recoveredRevenue: 0 };
    }
    recoveryByIntervention[key].count += 1;
    recoveryByIntervention[key].revenue += r.amount;
    if (r.status === "RECOVERED") recoveryByIntervention[key].recoveredRevenue += r.recoveredAmount;
  }
  for (const group of Object.values(recoveryByIntervention)) {
    group.recoveryRate = group.revenue > 0 ? group.recoveredRevenue / group.revenue : 0;
  }

  // Breakdown by dataset archetype (datasetGenerator.js) — how each case archetype
  // (retryable failure, high-value, opted-out, window-expired, ...) actually fared once run
  // through the real pipeline. Keyed by the stable archetypeId, not the human label.
  const archetypeBreakdown = {};
  for (const r of results) {
    const key = r.archetypeId;
    if (!archetypeBreakdown[key]) {
      archetypeBreakdown[key] = { label: r.archetype, count: 0, revenue: 0, recoveredRevenue: 0, recoveredCases: 0, escalatedCases: 0, stoppedCases: 0 };
    }
    const group = archetypeBreakdown[key];
    group.count += 1;
    group.revenue += r.amount;
    if (r.status === "RECOVERED") {
      group.recoveredRevenue += r.recoveredAmount;
      group.recoveredCases += 1;
    }
    if (r.status === "ESCALATED") group.escalatedCases += 1;
    if (r.status === "STOPPED") group.stoppedCases += 1;
  }
  for (const group of Object.values(archetypeBreakdown)) {
    group.recoveryRate = group.revenue > 0 ? group.recoveredRevenue / group.revenue : 0;
  }

  return {
    totalCases,
    totalRevenueAtRisk: sum(results, (r) => r.amount),
    eligibleRevenue,
    approvedCases,
    actionsExecuted,
    recoveryAttempts,
    recoveredRevenue,
    recoveryRate: eligibleRevenueSafe > 0 ? recoveredRevenue / eligibleRevenueSafe : 0,
    escalatedRevenue: sum(escalatedCases, (r) => r.amount),
    stoppedRevenue: sum(stoppedCases, (r) => r.amount),
    expiredRevenue: sum(expiredCases, (r) => r.amount),
    // Target is always 0 (executeAction is only ever called immediately after confirming
    // POLICY_APPROVED below) — computed for real per run, never hardcoded, so a future
    // regression would surface here instead of being silently hidden.
    policyViolations: results.filter((r) => r.policyViolation).length,
    averageAttempts: totalCases > 0 ? recoveryAttempts / totalCases : 0,
    recoveredCases: recoveredCases.length,
    escalatedCases: escalatedCases.length,
    stoppedCases: stoppedCases.length,
    expiredCases: expiredCases.length,
    failedCases: failedCases.length,
    recoveryByIntervention,
    archetypeBreakdown,
  };
}

/**
 * @param {{policy: object, seed: number, count: number}} args
 * @returns {{seed: number, totalCases: number, metrics: object, cases: Array<object>}}
 */
export function runBatchEvaluation({ policy, seed, count }) {
  const syntheticCases = generateSyntheticCases({ seed, count, policy });
  const results = [];

  for (const caseSeed of syntheticCases) {
    const recoveryCase = buildRecoveryCaseInput(caseSeed, policy);
    const customer = { optedOut: caseSeed.optedOut };
    const payment = caseSeed.failureReason ? { failureReason: caseSeed.failureReason } : null;

    runEvaluationPipeline({ recoveryCase, policy, customer, payment, history: caseSeed.history });

    let executed = false;
    let policyViolation = false;
    if (recoveryCase.status === "POLICY_APPROVED") {
      // Seeded per case (and run), not Math.random() — CLAUDE.md § Deterministic randomness.
      const rng = mulberry32(seedFromString(`${seed}:${caseSeed.index}`));
      executeAction({ recoveryCase, action: recoveryCase.selectedIntervention, rng });
      executed = true;
    } else if (recoveryCase.status === "ACTION_EXECUTED") {
      // Structurally unreachable given the check above, but computed rather than assumed —
      // see aggregateMetrics()'s policyViolations comment.
      policyViolation = true;
    }

    results.push({
      index: caseSeed.index,
      archetypeId: caseSeed.archetypeId,
      archetype: caseSeed.archetypeLabel,
      customerName: caseSeed.customerName,
      sourceType: recoveryCase.sourceType,
      amount: recoveryCase.amount,
      rootCause: recoveryCase.rootCause,
      recoveryProbability: recoveryCase.recoveryProbability,
      selectedIntervention: recoveryCase.selectedIntervention,
      policyDecision: recoveryCase.policyDecision,
      status: recoveryCase.status,
      recoveredAmount: recoveryCase.recoveredAmount,
      attempts: recoveryCase.attempts,
      executed,
      policyViolation,
    });
  }

  return { seed, totalCases: results.length, metrics: aggregateMetrics(results), cases: results };
}
