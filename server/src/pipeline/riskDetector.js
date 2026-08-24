// AGENT_DESIGN.md § The ten modules, module 1 — Revenue Risk Detector. Converts an incoming
// revenue-risk event (currently: a payment failure — SPEC.md § Scenario A) into a
// recovery_case candidate in RISK_DETECTED. Deliberately NOT inlined into a route handler
// (CLAUDE.md § Revenue Risk Detector: "Do not put this logic directly inside Express route
// handlers") so the real payment.failed path (future) and the demo trigger
// (routes/demo.js) both call this exact function, per ARCHITECTURE.md's "one pipeline, two
// triggers" pattern already established for checkout abandonment.

import { RecoveryCase } from "../models/index.js";

/**
 * @param {{merchant: object, customer: object, payment: object}} args
 * @returns {Promise<object>} the created RecoveryCase, in RISK_DETECTED
 */
export async function detectPaymentFailureRisk({ merchant, customer, payment }) {
  const recoveryWindowExpiresAt = new Date(
    Date.now() + merchant.policy.recoveryWindowHours * 60 * 60 * 1000
  );

  return RecoveryCase.create({
    merchantId: merchant._id,
    customerId: customer._id,
    sourceType: "PAYMENT_FAILURE",
    paymentId: payment._id,
    amount: payment.amount,
    currency: payment.currency,
    status: "RISK_DETECTED",
    recoveryWindowExpiresAt,
  });
}
