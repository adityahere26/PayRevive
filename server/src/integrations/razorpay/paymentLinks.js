// Verified against Razorpay's official Payment Links API docs (POST /v1/payment_links —
// razorpay.com/docs/api/payments/payment-links/create-standard/). No business/policy logic
// here — the full Payment Link safety checklist (RECOVERY_POLICY.md) runs in the caller before
// this is ever invoked; this file only shapes the request and normalizes the response.

import { razorpayRequest } from "./client.js";

const PAISE_PER_RUPEE = 100;

/**
 * Creates a Razorpay Test Mode Payment Link for a recovery case's own stored amount — never a
 * client-supplied value. `accept_partial: false` is deliberate: it structurally rules out the
 * `payment_link.partially_paid` webhook event, so the outcome is always a clean
 * paid/expired/cancelled tri-state, never a partial-amount case to reconcile.
 *
 * @param {{recoveryCase: object, customer: object|null}} args
 * @returns {Promise<{id: string, shortUrl: string, status: string, referenceId: string, amount: number}>}
 */
export async function createRazorpayPaymentLink({ recoveryCase, customer }) {
  const payload = {
    // Razorpay's smallest-currency-unit convention (paise for INR) — recoveryCase.amount is
    // stored in rupees throughout this codebase (see RecoveryCase.js / SPEC.md's worked
    // examples), so this multiplication is the one place that conversion must happen.
    amount: Math.round(recoveryCase.amount * PAISE_PER_RUPEE),
    currency: recoveryCase.currency || "INR",
    accept_partial: false,
    reference_id: recoveryCase._id.toString(),
    description: `payrevive recovery — case ${recoveryCase._id}`,
    notes: {
      recoveryCaseId: recoveryCase._id.toString(),
      merchantId: recoveryCase.merchantId.toString(),
    },
  };

  if (customer?.name || customer?.email || customer?.phone) {
    payload.customer = {
      ...(customer.name ? { name: customer.name } : {}),
      ...(customer.email ? { email: customer.email } : {}),
      ...(customer.phone ? { contact: customer.phone } : {}),
    };
  }

  const response = await razorpayRequest("/payment_links", { method: "POST", body: payload });

  return {
    id: response.id,
    shortUrl: response.short_url,
    status: response.status,
    referenceId: response.reference_id,
    amount: response.amount,
  };
}
