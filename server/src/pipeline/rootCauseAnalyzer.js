// AGENT_DESIGN.md § The ten modules, module 2 — Root Cause Analyzer. Deterministic lookup
// from a Razorpay-style payment failure reason code to one of ROOT_CAUSE_CATEGORIES
// (models/RecoveryCase.js). Answers ONLY "why did this payment fail" — it never sees or
// reasons about amount/policy. HIGH_VALUE_REQUIRES_REVIEW is a policy outcome, not a root
// cause, and is never produced here — see AGENT_DESIGN.md § HIGH_VALUE ownership.
//
// UNKNOWN is the explicit fallback for anything unmapped (AGENT_DESIGN.md § Root cause
// categories) — never silently guessed as something more specific than the evidence supports.

const FAILURE_REASON_MAP = {
  // Retryable — a subsequent attempt (later, or via a fresh payment link) can plausibly
  // succeed with no change from the customer.
  insufficient_funds: "RETRYABLE_PAYMENT_FAILURE",
  authentication_failed: "RETRYABLE_PAYMENT_FAILURE",
  otp_timeout: "RETRYABLE_PAYMENT_FAILURE",
  gateway_error: "RETRYABLE_PAYMENT_FAILURE",
  network_error: "RETRYABLE_PAYMENT_FAILURE",
  timeout: "RETRYABLE_PAYMENT_FAILURE",
  processing_error: "RETRYABLE_PAYMENT_FAILURE",

  // Non-retryable — the bank/issuer has declined in a way a retry won't fix.
  bank_declined: "NON_RETRYABLE_PAYMENT_FAILURE",
  card_declined: "NON_RETRYABLE_PAYMENT_FAILURE",
  issuer_declined: "NON_RETRYABLE_PAYMENT_FAILURE",
  fraud_suspected: "NON_RETRYABLE_PAYMENT_FAILURE",
  restricted_card: "NON_RETRYABLE_PAYMENT_FAILURE",

  // Customer's payment method itself needs fixing before any retry can succeed.
  card_expired: "CUSTOMER_PAYMENT_METHOD_ISSUE",
  invalid_card: "CUSTOMER_PAYMENT_METHOD_ISSUE",
  invalid_upi_pin: "CUSTOMER_PAYMENT_METHOD_ISSUE",
  expired_upi_mandate: "CUSTOMER_PAYMENT_METHOD_ISSUE",

  // The customer actively backed out.
  customer_cancelled: "CUSTOMER_DECLINED",
  payment_cancelled: "CUSTOMER_DECLINED",
};

/**
 * @param {{failureReason?: string|null}|null} payment
 * @returns {string} one of ROOT_CAUSE_CATEGORIES
 */
export function analyzeRootCause(payment) {
  if (!payment || !payment.failureReason) return "UNKNOWN";
  const normalized = payment.failureReason.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return FAILURE_REASON_MAP[normalized] || "UNKNOWN";
}
