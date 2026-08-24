// AGENT_DESIGN.md § Tools (backend service functions) — the merchant-scoped data accessors
// named in the brief, implemented as plain backend functions callable only by pipeline/route
// code, never by an AI Decision/Planner directly. Every query is scoped by merchantId at the
// query level (SECURITY.md § Authorization / IDOR prevention), never filtered after the fact.

import { Customer, Payment, RecoveryCase } from "../models/index.js";
import { createRazorpayPaymentLink } from "../integrations/razorpay/paymentLinks.js";
import { executeAction } from "./actionExecutor.js";

const RESOLVED_CASE_STATUSES = ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];

// Day 6 — atomic payment-link creation claim. Self-healing: a stale claim (older than the TTL)
// is treated as expired and becomes reclaimable, so a crashed request can never permanently
// lock a case (verified architecture § idempotency, "the desired behavior" flow). Generous
// relative to Razorpay's own 5s webhook-response expectation elsewhere, since this covers our
// own outbound call to Razorpay, not a response to Razorpay.
const PAYMENT_LINK_CLAIM_TTL_MS = 30_000;

/**
 * Single atomic Mongo operation — never read-then-write. Only matches a case that is
 * POLICY_APPROVED for CREATE_PAYMENT_LINK, has no link yet, and is not currently claimed (or
 * whose claim has expired). Returns the claimed document, or null if none of that held (already
 * has a link, wrong state, or a concurrent request holds a live claim).
 */
export async function claimPaymentLinkCreation(caseId, merchantId) {
  const staleThreshold = new Date(Date.now() - PAYMENT_LINK_CLAIM_TTL_MS);
  return RecoveryCase.findOneAndUpdate(
    {
      _id: caseId,
      merchantId,
      status: "POLICY_APPROVED",
      selectedIntervention: "CREATE_PAYMENT_LINK",
      razorpayPaymentLinkId: null,
      $or: [{ razorpayLinkClaimedAt: null }, { razorpayLinkClaimedAt: { $lt: staleThreshold } }],
    },
    { $set: { razorpayLinkClaimedAt: new Date() } },
    { new: true }
  );
}

/** Releases a claim after a failed Razorpay call — the case stays POLICY_APPROVED, retryable. */
export async function releasePaymentLinkClaim(caseId) {
  await RecoveryCase.updateOne({ _id: caseId }, { $set: { razorpayLinkClaimedAt: null } });
}

/**
 * AGENT_DESIGN.md § Tools — createPaymentLink(case). The ONE function that claims a case, calls
 * the Razorpay adapter, and runs the (live) Action Executor — both routes/recoveryCases.js's
 * POST /:id/payment-link and routes/voice.js's POST /:id/voice/turn call this, so there is
 * exactly one Razorpay-executing code path, never a voice-specific one (AGENT_DESIGN.md § Voice
 * pipeline: "Do NOT create a separate Razorpay voice executor").
 *
 * Never persists (recoveryCase.save()) and never writes audit/RecoveryAction records — callers
 * do that, exactly as they already do for the simulated executeAction() result, so this stays
 * consistent with the rest of the pipeline's "modules compute, routes persist" convention.
 *
 * @param {{recoveryCase: object, merchantId: string, customer: object|null}} args
 * @returns {Promise<
 *   {ok: true, reused: boolean, recoveryCase: object, link: object, result?: object} |
 *   {ok: false, code: "CLAIM_CONFLICT"|"RAZORPAY_UNAVAILABLE", error?: Error}
 * >}
 */
export async function createLivePaymentLink({ recoveryCase, merchantId, customer }) {
  const claimed = await claimPaymentLinkCreation(recoveryCase._id, merchantId);

  if (!claimed) {
    // Either a concurrent request holds the claim, or the link already exists — re-fetch to
    // find out which, so a legitimate retry after success is idempotent, not an error.
    const fresh = await RecoveryCase.findOne({ _id: recoveryCase._id, merchantId });
    if (fresh?.razorpayPaymentLinkId) {
      return {
        ok: true,
        reused: true,
        recoveryCase: fresh,
        link: { id: fresh.razorpayPaymentLinkId, shortUrl: fresh.razorpayPaymentLinkShortUrl },
      };
    }
    return { ok: false, code: "CLAIM_CONFLICT" };
  }

  let link;
  try {
    link = await createRazorpayPaymentLink({ recoveryCase: claimed, customer });
  } catch (error) {
    // Failure safety: never fabricate a link, never leave the case locked — release the claim
    // so it's immediately retryable (verified architecture § failure/retry approach).
    await releasePaymentLinkClaim(claimed._id);
    return { ok: false, code: "RAZORPAY_UNAVAILABLE", error };
  }

  claimed.razorpayPaymentLinkId = link.id;
  claimed.razorpayPaymentLinkShortUrl = link.shortUrl;
  const result = executeAction({ recoveryCase: claimed, action: "CREATE_PAYMENT_LINK", live: true });

  return { ok: true, reused: false, recoveryCase: claimed, link, result };
}

export async function getCustomerHistory(customerId, merchantId) {
  const [prevSuccessfulPayments, prevFailedPayments, lastPayment, priorCases] = await Promise.all([
    Payment.countDocuments({ merchantId, customerId, status: "paid" }),
    Payment.countDocuments({ merchantId, customerId, status: "failed" }),
    Payment.findOne({ merchantId, customerId }).sort({ createdAt: -1 }),
    RecoveryCase.find({ merchantId, customerId, status: { $in: RESOLVED_CASE_STATUSES } }).select("status"),
  ]);

  const resolvedCount = priorCases.length;
  const recoveredCount = priorCases.filter((c) => c.status === "RECOVERED").length;

  return {
    prevSuccessfulPayments,
    prevFailedPayments,
    lastActivityAt: lastPayment ? lastPayment.createdAt : null,
    priorRecoverySuccessRate: resolvedCount > 0 ? recoveredCount / resolvedCount : null,
  };
}

/** SECURITY.md-style scoped fetch — never findById alone. */
export async function getRecoveryCase(caseId, merchantId) {
  return RecoveryCase.findOne({ _id: caseId, merchantId });
}

export async function getCustomer(customerId, merchantId) {
  return Customer.findOne({ _id: customerId, merchantId });
}

export async function getPaymentDetails(paymentId, merchantId) {
  if (!paymentId) return null;
  return Payment.findOne({ _id: paymentId, merchantId });
}
