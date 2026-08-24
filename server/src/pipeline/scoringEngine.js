// AGENT_DESIGN.md § The ten modules, module 4 — Recovery Scoring Engine. Runs only for
// ELIGIBLE cases. RECOVERY_POLICY.md § Recovery scoring: a transparent, weighted formula —
// never "the model says 87%." Pure function: no DB access, no side effects — `history` is
// pre-fetched by the caller (pipeline/tools.js getCustomerHistory).

const ROOT_CAUSE_FACTOR = {
  RETRYABLE_PAYMENT_FAILURE: 1.0,
  CUSTOMER_PAYMENT_METHOD_ISSUE: 0.6,
  CHECKOUT_ABANDONMENT: 0.5,
  NON_RETRYABLE_PAYMENT_FAILURE: 0.1,
  CUSTOMER_DECLINED: 0.1,
  // Not in RECOVERY_POLICY.md's worked table (which only lists mapped root causes) — 0.3 is a
  // documented, tunable middle-ground default for a case with no clear signal either way.
  UNKNOWN: 0.3,
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {object} recoveryCase must have rootCause, attempts, createdAt
 * @param {{prevSuccessfulPayments: number, prevFailedPayments: number, lastActivityAt: Date|null, priorRecoverySuccessRate: number|null}} history
 * @param {object} policy must have recoveryWindowHours
 * @returns {{recoveryProbability: number, reasonCodes: string[]}}
 */
export function calculateRecoveryScore(recoveryCase, history, policy) {
  const { prevSuccessfulPayments, prevFailedPayments, lastActivityAt, priorRecoverySuccessRate } = history;

  const successRatio = prevSuccessfulPayments / (prevSuccessfulPayments + prevFailedPayments + 1);
  const rootCauseFactor = ROOT_CAUSE_FACTOR[recoveryCase.rootCause] ?? ROOT_CAUSE_FACTOR.UNKNOWN;

  const hoursSinceFailure = (Date.now() - new Date(recoveryCase.createdAt).getTime()) / (1000 * 60 * 60);
  const recencyFactor =
    hoursSinceFailure <= 6
      ? 1.0
      : Math.max(0, 1 - (hoursSinceFailure - 6) / Math.max(1, policy.recoveryWindowHours - 6));

  const activityFactor =
    lastActivityAt && Date.now() - new Date(lastActivityAt).getTime() <= THIRTY_DAYS_MS ? 1.0 : 0.3;

  const priorRecoveryFactor = priorRecoverySuccessRate ?? 0.5;

  const attemptPenalty = Math.max(0, 1 - 0.3 * recoveryCase.attempts);

  const raw =
    0.3 * successRatio +
    0.2 * rootCauseFactor +
    0.15 * recencyFactor +
    0.15 * activityFactor +
    0.1 * priorRecoveryFactor +
    0.1 * attemptPenalty;

  const recoveryProbability = Math.min(1, Math.max(0, raw));

  const reasonCodes = [];
  if (successRatio > 0.7) reasonCodes.push("PREVIOUS_SUCCESSFUL_PAYMENTS");
  if (rootCauseFactor === 1.0) reasonCodes.push("RETRYABLE_FAILURE");
  if (recencyFactor > 0.6) reasonCodes.push("WITHIN_RECOVERY_WINDOW");
  if (activityFactor === 1.0) reasonCodes.push("ACTIVE_CUSTOMER");

  return { recoveryProbability, reasonCodes };
}
