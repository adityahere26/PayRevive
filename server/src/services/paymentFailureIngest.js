// The one place a failed payment becomes a recovery case + recovery-plan item, regardless of
// how PayRevive learned about the failure. ARCHITECTURE.md's "one pipeline, N triggers" pattern:
//
//   - DEMO_SIMULATION  — routes/demo.js POST /payment-failure (the "Simulate Payment Failure"
//                        control; DEMO/TEST only).
//   - RAZORPAY_WEBHOOK  — routes/webhooks.js POST /api/webhooks/razorpay/inbound/:webhookId
//                        (a connected merchant's real Razorpay `payment.failed` deliveries).
//
// Both call this function with an already-resolved, trusted `merchant` (from the authenticated
// session, or from the per-merchant webhookId in the URL) and a plain `customerInput` object.
// merchantId / amount / customerId are never taken from untrusted transport past this point —
// CLAUDE.md core principle #3.
//
// The pipeline itself is untouched: detectPaymentFailureRisk (riskDetector.js) then, when
// autoplan is enabled, planRecoveryForCase (recoveryPlan.js) — the exact same evaluate →
// policy → plan-item flow as before. No customer is contacted here (approval-gated autonomy).

import { Customer, Payment } from "../models/index.js";
import { detectPaymentFailureRisk } from "../pipeline/riskDetector.js";
import { planRecoveryForCase, serializePlan } from "../pipeline/recoveryPlan.js";
import { writeAuditLog } from "../audit/auditLogger.js";
import { env } from "../config/env.js";

/**
 * @param {object} args
 * @param {object} args.merchant           a loaded Merchant document (trusted)
 * @param {object} args.customerInput      { name, email?, phone?, optedOut? }
 * @param {number} args.amount             major units (rupees)
 * @param {string} [args.currency="INR"]
 * @param {string} args.failureReason
 * @param {string|null} [args.razorpayPaymentId=null]
 * @param {"DEMO_SIMULATION"|"RAZORPAY_WEBHOOK"} [args.source="DEMO_SIMULATION"]
 * @returns {Promise<{recoveryCase: object, payment: object, customer: object, plan: object|null}>}
 */
export async function ingestPaymentFailure({
  merchant,
  customerInput,
  amount,
  currency = "INR",
  failureReason,
  razorpayPaymentId = null,
  source = "DEMO_SIMULATION",
}) {
  // Upsert-by-email-per-merchant so repeated failures for the same customer build real payment
  // history (Payment collection) instead of a fresh, historyless customer each time — that
  // history is what the Scoring Engine reads.
  let customer;
  if (customerInput.email) {
    customer = await Customer.findOneAndUpdate(
      { merchantId: merchant._id, email: customerInput.email.toLowerCase() },
      {
        $setOnInsert: {
          merchantId: merchant._id,
          name: customerInput.name,
          email: customerInput.email.toLowerCase(),
          phone: customerInput.phone,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (typeof customerInput.optedOut === "boolean" && customer.optedOut !== customerInput.optedOut) {
      customer.optedOut = customerInput.optedOut;
      await customer.save();
    }
  } else {
    customer = await Customer.create({
      merchantId: merchant._id,
      name: customerInput.name,
      phone: customerInput.phone,
      optedOut: Boolean(customerInput.optedOut),
    });
  }

  const payment = await Payment.create({
    merchantId: merchant._id,
    customerId: customer._id,
    amount,
    currency,
    status: "failed",
    failureReason,
    razorpayPaymentId,
  });

  const recoveryCase = await detectPaymentFailureRisk({ merchant, customer, payment });

  await writeAuditLog({
    merchantId: merchant._id,
    caseId: recoveryCase._id,
    actor: "SYSTEM",
    eventType: "REVENUE_RISK_DETECTED",
    reason: "PAYMENT_FAILED",
    metadata: { paymentId: payment._id, amount: recoveryCase.amount, sourceType: "PAYMENT_FAILURE", source },
    result: recoveryCase.status,
  });

  // Approval-gated autonomy (ARCHITECTURE.md § Recovery plans): PayRevive autonomously runs the
  // evaluate pipeline and records the decision as an item on the merchant's recovery plan. It
  // does NOT contact the customer — no payment link, no call — until the merchant confirms the
  // plan. Disabled only when RECOVERY_AUTOPLAN_ENABLED=false (forced off in the test harness).
  let finalCase = recoveryCase;
  let plan = null;
  if (env.RECOVERY_AUTOPLAN_ENABLED) {
    const result = await planRecoveryForCase({ recoveryCase, merchant, customer, payment });
    finalCase = result.recoveryCase || recoveryCase;
    plan = result.plan ? serializePlan(result.plan) : null;
  }

  return { recoveryCase: finalCase, payment, customer, plan };
}
