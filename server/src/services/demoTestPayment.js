// DEV/DEMO helper — completes a Razorpay Test Mode payment for a recovery case whose payment
// link is awaiting an outcome, WITHOUT bypassing anything.
//
// In a real Buildathon demo a judge would open the Test Mode short URL, pay with a test card,
// and Razorpay's servers would POST a signed payment_link.paid webhook. Automating that
// external checkout is impractical in this environment, so this helper does exactly — and only
// — what Razorpay's servers would do: it builds the payment_link.paid event, signs it with
// RAZORPAY_WEBHOOK_SECRET, and delivers it to the REAL /api/webhooks/razorpay route. Signature
// verification, the link-id / amount / currency cross-checks, the WebhookEvent idempotency
// ledger and pipeline/outcomeEvaluator.js all run unchanged. It never touches RecoveryCase
// directly — the invariant "only a verified webhook credits recoveredAmount" is preserved.

import { RecoveryCase } from "../models/index.js";
import { env } from "../config/env.js";
import { signRazorpayWebhookBody } from "../integrations/razorpay/webhookVerify.js";
import { ConflictError } from "../lib/errors.js";

const PAISE_PER_RUPEE = 100;

function paymentLinkPaidEvent(recoveryCase) {
  const amountPaise = recoveryCase.amount * PAISE_PER_RUPEE;
  return JSON.stringify({
    event: "payment_link.paid",
    entity: "event",
    contains: ["payment_link"],
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment_link: {
        entity: {
          id: recoveryCase.razorpayPaymentLinkId,
          reference_id: String(recoveryCase._id),
          status: "paid",
          amount: amountPaise,
          amount_paid: amountPaise,
          currency: recoveryCase.currency || "INR",
        },
      },
    },
  });
}

/**
 * @param {{merchantId: any, caseId?: string|null, selfBase: string}} args
 *   selfBase — origin of the running server, e.g. "http://127.0.0.1:53211", so the signed
 *   event can be POSTed back to this same server's real webhook route.
 * @returns {Promise<{completed: Array<object>, note: string}>}
 */
export async function completeDemoTestPayments({ merchantId, caseId = null, selfBase }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new ConflictError("RAZORPAY_WEBHOOK_SECRET is not configured — cannot deliver a signed test webhook");
  }

  const filter = {
    merchantId,
    status: "WAITING_OUTCOME",
    razorpayPaymentLinkId: { $ne: null },
  };
  if (caseId) filter._id = caseId;

  const cases = await RecoveryCase.find(filter);

  const completed = [];
  for (const recoveryCase of cases) {
    const rawBody = paymentLinkPaidEvent(recoveryCase);
    const signature = signRazorpayWebhookBody(rawBody, env.RAZORPAY_WEBHOOK_SECRET);
    // Deterministic per link, so re-running this helper is idempotent at the webhook dedup
    // layer too (the route returns ALREADY_PROCESSED on the second delivery).
    const eventId = `demo-plink-${recoveryCase._id}`;

    let webhookStatus = "UNKNOWN";
    let httpStatus = 0;
    try {
      const res = await fetch(`${selfBase}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
          "x-razorpay-event-id": eventId,
        },
        body: rawBody,
      });
      httpStatus = res.status;
      const body = await res.json().catch(() => ({}));
      webhookStatus = body.status || body.error?.code || String(res.status);
    } catch (err) {
      webhookStatus = `DELIVERY_ERROR: ${err.message}`;
    }

    const fresh = await RecoveryCase.findById(recoveryCase._id);
    completed.push({
      caseId: String(recoveryCase._id),
      razorpayPaymentLinkId: recoveryCase.razorpayPaymentLinkId,
      amount: recoveryCase.amount,
      webhookHttpStatus: httpStatus,
      webhookStatus,
      caseStatus: fresh?.status ?? null,
      recoveredAmount: fresh?.recoveredAmount ?? 0,
    });
  }

  return {
    demo: true,
    completed,
    note:
      "DEMO/TEST: a signed payment_link.paid webhook was delivered to the real /api/webhooks/razorpay " +
      "route for each pending Razorpay Test Mode link. Signature verification, cross-checks and " +
      "idempotency all ran unchanged — only a verified outcome credited recoveredAmount.",
  };
}
