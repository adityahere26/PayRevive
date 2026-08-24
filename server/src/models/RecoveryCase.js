// See ARCHITECTURE.md § Payment state machine and § Database schema (recovery_cases), and
// RECOVERY_POLICY.md § Policy precedence for how `status`, `rootCause`, and `policyDecision`
// get populated by the (not-yet-built) recovery pipeline.

import mongoose from "mongoose";

const { Schema } = mongoose;

export const RECOVERY_CASE_STATUSES = [
  "RISK_DETECTED",
  "ANALYZING",
  "ELIGIBLE",
  "ACTION_SELECTED",
  "POLICY_APPROVED",
  "ACTION_EXECUTED",
  "WAITING_OUTCOME",
  "RECOVERED",
  "FAILED", // transient — always re-enters ANALYZING, never terminal (ARCHITECTURE.md)
  "STOPPED",
  "ESCALATED",
  "EXPIRED",
];

export const ROOT_CAUSE_CATEGORIES = [
  "RETRYABLE_PAYMENT_FAILURE",
  "NON_RETRYABLE_PAYMENT_FAILURE",
  "CUSTOMER_PAYMENT_METHOD_ISSUE",
  "CHECKOUT_ABANDONMENT",
  "CUSTOMER_DECLINED",
  "UNKNOWN",
];

export const INTERVENTIONS = [
  "CREATE_PAYMENT_LINK",
  "START_VOICE_RECOVERY",
  "RECORD_PROMISE_TO_PAY",
  "ESCALATE",
  "STOP",
];

const recoveryCaseSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    sourceType: {
      type: String,
      enum: ["PAYMENT_FAILURE", "CHECKOUT_ABANDONMENT"],
      required: true,
    },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    checkoutSessionId: { type: Schema.Types.ObjectId, ref: "CheckoutSession", default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: RECOVERY_CASE_STATUSES,
      default: "RISK_DETECTED",
      index: true,
    },
    rootCause: { type: String, enum: ROOT_CAUSE_CATEGORIES, default: null },
    recoveryProbability: { type: Number, min: 0, max: 1, default: null },
    reasonCodes: { type: [String], default: [] },
    selectedIntervention: { type: String, enum: INTERVENTIONS, default: null },
    // Reason code from the shared precedence function (e.g. HIGH_VALUE_REQUIRES_REVIEW,
    // RECOVERY_WINDOW_EXPIRED, RETRY_LIMIT_REACHED, OPT_OUT_BEHAVIOR, APPROVED) — see
    // RECOVERY_POLICY.md § Policy precedence.
    policyDecision: { type: String, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    voiceAttempts: { type: Number, default: 0, min: 0 },
    recoveredAmount: { type: Number, default: 0, min: 0 },
    recoveryWindowExpiresAt: { type: Date, required: true },
    // Day 6 — Razorpay Test Mode Payment Links. Safe identifiers only (never a credential).
    // razorpayPaymentLinkId doubles as the idempotency check in the Payment Link safety
    // checklist (RECOVERY_POLICY.md): once set, a retry/double-click reuses this link instead
    // of creating a second one.
    razorpayPaymentLinkId: { type: String, default: null },
    razorpayPaymentLinkShortUrl: { type: String, default: null },
    // Self-healing claim for atomic payment-link creation (see pipeline/tools.js
    // claimPaymentLinkCreation). A stale claim (older than the TTL) is automatically
    // reclaimable, so a crashed request can never permanently lock a case.
    razorpayLinkClaimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

recoveryCaseSchema.index({ merchantId: 1, status: 1 });
recoveryCaseSchema.index({ merchantId: 1, createdAt: -1 });

export const RecoveryCase = mongoose.model("RecoveryCase", recoveryCaseSchema);
