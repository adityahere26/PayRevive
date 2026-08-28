// POST /api/webhooks/razorpay — verified against Razorpay's official webhook docs:
//   - signature header: X-Razorpay-Signature (HMAC-SHA256 over the RAW body)
//   - dedup header: X-Razorpay-Event-Id ("unique per event... can help you determine the
//     duplicity of a webhook event")
//   - at-least-once delivery, 5s response window, exponential-backoff retry for 24h
//   - events: payment_link.paid / payment_link.expired / payment_link.cancelled
// No auth middleware — Razorpay is not a logged-in merchant. Every authorization decision here
// is instead derived from the stored RecoveryCase (never trusted from the webhook payload),
// per SECURITY.md § Authorization / IDOR prevention applied to a platform-level route.
//
// Mounted in app.js BEFORE the global express.json() parser — signature verification requires
// the untouched raw body (Razorpay's own docs: "do not parse or cast the webhook request
// body"), so this route brings its own express.raw() middleware.
//
// Never calls Gemini here (CLAUDE.md § Day 6 requirement 7) — this route only ever touches
// WebhookEvent / RecoveryCase / RecoveryAction / AuditLog, keeping it fast within Razorpay's 5s
// window.

import { Router } from "express";
import express from "express";
import crypto from "node:crypto";
import { Merchant, RecoveryCase, RecoveryAction, WebhookEvent } from "../models/index.js";
import { env } from "../config/env.js";
import { verifyRazorpaySignature } from "../integrations/razorpay/webhookVerify.js";
import { resolveRecoveryOutcome } from "../pipeline/outcomeEvaluator.js";
import { ingestPaymentFailure } from "../services/paymentFailureIngest.js";
import { writeAuditLog } from "../audit/auditLogger.js";
import { logger } from "../lib/logger.js";
import { razorpayWebhookRateLimiter } from "../middleware/rateLimit.js";

export const webhooksRouter = Router();

const PAISE_PER_RUPEE = 100;

// payment_link.partially_paid is not handled — createRazorpayPaymentLink always sets
// accept_partial:false, so that event should never fire for a link this system created.
const HANDLED_EVENTS = {
  "payment_link.paid": "RECOVERED",
  "payment_link.expired": "FAILED",
  "payment_link.cancelled": "FAILED", // defensive — this system never exposes a cancel action
};

webhooksRouter.post(
  "/razorpay",
  razorpayWebhookRateLimiter,
  express.raw({ type: "application/json", limit: "100kb" }),
  async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Platform-level rejections (no merchant/case resolved yet) are logged, not written to
    // audit_logs — AuditLog.merchantId is a required field (ARCHITECTURE.md § Database
    // schema), and these rejections are, by definition, not yet attributable to any merchant.
    if (!env.RAZORPAY_WEBHOOK_SECRET || !signature || !eventId || rawBody.length === 0) {
      logger.warn("razorpay webhook rejected: missing secret/signature/eventId/body", {
        hasSecret: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
        hasSignature: Boolean(signature),
        hasEventId: Boolean(eventId),
      });
      res.status(400).json({ error: { code: "WEBHOOK_REJECTED", message: "Malformed webhook request" } });
      return;
    }

    if (!verifyRazorpaySignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
      logger.warn("razorpay webhook rejected: invalid signature", { eventId });
      res.status(400).json({ error: { code: "WEBHOOK_REJECTED", message: "Invalid signature" } });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      logger.warn("razorpay webhook rejected: invalid JSON body", { eventId });
      res.status(400).json({ error: { code: "WEBHOOK_REJECTED", message: "Invalid JSON body" } });
      return;
    }

    // Idempotency: unique index on eventId short-circuits a duplicate delivery before any
    // state-changing code runs (SECURITY.md § Webhook security). A duplicate insert throws a
    // Mongo E11000 error, caught below.
    let eventDoc;
    try {
      eventDoc = await WebhookEvent.create({
        eventId,
        eventType: payload.event || "unknown",
        payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
      });
    } catch (err) {
      if (err.code === 11000) {
        res.status(200).json({ status: "ALREADY_PROCESSED" });
        return;
      }
      logger.error("razorpay webhook: WebhookEvent insert failed", { eventId, error: err.message });
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Could not record webhook event" } });
      return;
    }

    try {
      const outcome = HANDLED_EVENTS[payload.event];
      const linkEntity = payload.payload?.payment_link?.entity;

      if (!outcome || !linkEntity) {
        eventDoc.status = "PROCESSED";
        eventDoc.processedAt = new Date();
        await eventDoc.save();
        res.status(200).json({ status: "IGNORED" });
        return;
      }

      const referenceId = linkEntity.reference_id;
      const recoveryCase = referenceId ? await RecoveryCase.findOne({ _id: referenceId }) : null;

      if (!recoveryCase) {
        eventDoc.status = "FAILED";
        eventDoc.processingError = "No recovery case matches reference_id";
        eventDoc.processedAt = new Date();
        await eventDoc.save();
        logger.warn("razorpay webhook: no matching recovery case", { eventId, referenceId });
        res.status(200).json({ status: "IGNORED" }); // ack — retrying won't create a matching case
        return;
      }

      // Never trust merchantId/amount/currency from the webhook payload — cross-check against
      // the case WE stored them on (CLAUDE.md § Day 6 requirement 9), now that we know which
      // merchant this is.
      const amountMismatch = recoveryCase.amount !== Math.round((linkEntity.amount || 0) / PAISE_PER_RUPEE);
      const currencyMismatch = (recoveryCase.currency || "INR") !== (linkEntity.currency || "INR");
      const linkIdMismatch = recoveryCase.razorpayPaymentLinkId !== linkEntity.id;

      if (amountMismatch || currencyMismatch || linkIdMismatch) {
        eventDoc.status = "FAILED";
        eventDoc.processingError = "Cross-check failed (link id / amount / currency)";
        eventDoc.processedAt = new Date();
        await eventDoc.save();
        await writeAuditLog({
          merchantId: recoveryCase.merchantId,
          caseId: recoveryCase._id,
          actor: "SYSTEM",
          eventType: "RAZORPAY_WEBHOOK_REJECTED",
          reason: linkIdMismatch ? "LINK_ID_MISMATCH" : amountMismatch ? "AMOUNT_MISMATCH" : "CURRENCY_MISMATCH",
          result: recoveryCase.status,
          metadata: { eventId, eventType: payload.event },
        });
        res.status(200).json({ status: "IGNORED" });
        return;
      }

      await writeAuditLog({
        merchantId: recoveryCase.merchantId,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: "RAZORPAY_WEBHOOK_VERIFIED",
        reason: payload.event,
        result: null,
        metadata: { eventId, razorpayPaymentLinkId: linkEntity.id },
      });

      const resolution = resolveRecoveryOutcome({ recoveryCase, outcome });

      if (!resolution.applied) {
        // Case already resolved by an earlier delivery — duplicate events must never mutate
        // state or revenue twice (CLAUDE.md § Day 6 requirement 7).
        eventDoc.status = "PROCESSED";
        eventDoc.processedAt = new Date();
        await eventDoc.save();
        res.status(200).json({ status: "ALREADY_RESOLVED" });
        return;
      }

      await recoveryCase.save();

      await RecoveryAction.create({
        caseId: recoveryCase._id,
        merchantId: recoveryCase.merchantId,
        actionType: "CREATE_PAYMENT_LINK",
        status: "LIVE_TEST_MODE",
        result: recoveryCase.status,
        metadata: { live: true, razorpayPaymentLinkId: linkEntity.id, source: "WEBHOOK" },
      });

      await writeAuditLog({
        merchantId: recoveryCase.merchantId,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: outcome === "RECOVERED" ? "PAYMENT_RECOVERY_SUCCEEDED" : "PAYMENT_RECOVERY_FAILED",
        reason: payload.event,
        result: recoveryCase.status,
        metadata: { eventId, razorpayPaymentLinkId: linkEntity.id, recoveredAmount: recoveryCase.recoveredAmount },
      });

      eventDoc.status = "PROCESSED";
      eventDoc.processedAt = new Date();
      await eventDoc.save();

      res.status(200).json({ status: "PROCESSED" });
    } catch (err) {
      eventDoc.status = "FAILED";
      eventDoc.processingError = "Internal processing error";
      await eventDoc.save().catch(() => {});
      logger.error("razorpay webhook processing failed", { eventId, error: err.message });
      // Ack anyway — Razorpay would otherwise retry an error that reprocessing can't fix, and
      // the FAILED WebhookEvent record plus the log line above capture it for investigation.
      res.status(200).json({ status: "FAILED" });
    }
  }
);

// -------------------------------------------------------------------------------------------
// POST /api/webhooks/razorpay/inbound/:webhookId — a CONNECTED merchant's own Razorpay
// `payment.failed` deliveries (ARCHITECTURE.md § Inbound payment-failure webhook). This is the
// real, code-free integration path: a business pastes this URL + a per-merchant signing secret
// into their Razorpay Dashboard (routes/integration.js issues both), and failed payments start
// flowing into the same recovery pipeline the "Simulate Payment Failure" demo control uses.
//
// Kept entirely separate from the platform /razorpay handler above (which stays byte-for-byte
// unchanged and continues to own payment_link.* outcome events + the demo test-payment flow).
// This handler ONLY ingests payment.failed; link-outcome events on a per-merchant endpoint are
// a later addition. Shared primitives are reused verbatim: verifyRazorpaySignature,
// WebhookEvent's unique-index idempotency, and services/paymentFailureIngest.js.
//
// The merchant is resolved from the :webhookId in the URL and NOTHING is taken from the
// payload to identify or authorize (CLAUDE.md core principle #3).
// -------------------------------------------------------------------------------------------

/**
 * Razorpay `payment.failed` entity → the plain customerInput the ingest pipeline expects.
 * Fully untrusted (SECURITY.md § Input and AI output validation): only contact fields are read;
 * amount/currency are taken as numbers from the entity and merchant identity comes from the
 * resolved endpoint, never from `notes`.
 */
function mapRazorpayPaymentFailed(entity) {
  const email = typeof entity.email === "string" ? entity.email.trim().toLowerCase() : "";
  const notesName =
    entity.notes && typeof entity.notes.name === "string" ? entity.notes.name.trim() : "";
  const name = (notesName || (email ? email.split("@")[0] : "") || "Customer").slice(0, 200);
  const phone = typeof entity.contact === "string" ? entity.contact.trim().slice(0, 20) : undefined;
  return { name, email: email || undefined, phone };
}

webhooksRouter.post(
  "/razorpay/inbound/:webhookId",
  razorpayWebhookRateLimiter,
  express.raw({ type: "application/json", limit: "100kb" }),
  async (req, res) => {
    const { webhookId } = req.params;
    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Attribute the delivery to a merchant by the URL's webhookId. An unknown id isn't
    // attributable to any merchant, so — like the platform route's unresolved-case path — it's
    // logged, not written to audit_logs (AuditLog.merchantId is required).
    let merchant;
    try {
      merchant = await Merchant.findOne({ "integration.razorpay.webhookId": webhookId }).select(
        "+integration.razorpay.webhookSecret"
      );
    } catch (err) {
      logger.error("razorpay inbound webhook: merchant lookup failed", { webhookId, error: err.message });
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Lookup failed" } });
      return;
    }

    const secret = merchant?.integration?.razorpay?.webhookSecret;
    if (!merchant || !secret) {
      logger.warn("razorpay inbound webhook rejected: unknown webhookId", { webhookId });
      res.status(404).json({ error: { code: "WEBHOOK_ENDPOINT_NOT_FOUND", message: "Unknown webhook endpoint" } });
      return;
    }

    if (!signature || !eventId || rawBody.length === 0) {
      logger.warn("razorpay inbound webhook rejected: missing signature/eventId/body", {
        webhookId,
        hasSignature: Boolean(signature),
        hasEventId: Boolean(eventId),
      });
      res.status(400).json({ error: { code: "WEBHOOK_REJECTED", message: "Malformed webhook request" } });
      return;
    }

    if (!verifyRazorpaySignature(rawBody, signature, secret)) {
      logger.warn("razorpay inbound webhook rejected: invalid signature", { webhookId, eventId });
      await writeAuditLog({
        merchantId: merchant._id,
        actor: "SYSTEM",
        eventType: "RAZORPAY_WEBHOOK_REJECTED",
        reason: "INBOUND_SIGNATURE_INVALID",
        result: null,
        metadata: { eventId, webhookId },
      });
      res.status(400).json({ error: { code: "WEBHOOK_REJECTED", message: "Invalid signature" } });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      logger.warn("razorpay inbound webhook rejected: invalid JSON body", { webhookId, eventId });
      res.status(400).json({ error: { code: "WEBHOOK_REJECTED", message: "Invalid JSON body" } });
      return;
    }

    // Idempotency: the same platform-wide WebhookEvent collection + unique index on eventId the
    // platform route uses. A duplicate delivery short-circuits before any state-changing code.
    let eventDoc;
    try {
      eventDoc = await WebhookEvent.create({
        eventId,
        eventType: payload.event || "unknown",
        payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
      });
    } catch (err) {
      if (err.code === 11000) {
        res.status(200).json({ status: "ALREADY_PROCESSED" });
        return;
      }
      logger.error("razorpay inbound webhook: WebhookEvent insert failed", {
        webhookId,
        eventId,
        error: err.message,
      });
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Could not record webhook event" } });
      return;
    }

    try {
      const entity = payload.payload?.payment?.entity;
      if (payload.event !== "payment.failed" || !entity) {
        eventDoc.status = "PROCESSED";
        eventDoc.processedAt = new Date();
        await eventDoc.save();
        res.status(200).json({ status: "IGNORED" });
        return;
      }

      const { recoveryCase } = await ingestPaymentFailure({
        merchant,
        customerInput: mapRazorpayPaymentFailed(entity),
        amount: Math.round((entity.amount || 0) / PAISE_PER_RUPEE),
        currency: entity.currency || "INR",
        failureReason:
          entity.error_description || entity.error_reason || entity.error_code || "unknown",
        razorpayPaymentId: entity.id || null,
        source: "RAZORPAY_WEBHOOK",
      });

      eventDoc.status = "PROCESSED";
      eventDoc.processedAt = new Date();
      await eventDoc.save();

      res.status(200).json({ status: "PROCESSED", recoveryCaseId: recoveryCase?._id });
    } catch (err) {
      eventDoc.status = "FAILED";
      eventDoc.processingError = "Internal processing error";
      await eventDoc.save().catch(() => {});
      logger.error("razorpay inbound webhook processing failed", { webhookId, eventId, error: err.message });
      // Ack anyway — a reprocessing-proof error must not trigger Razorpay's 24h retry storm;
      // the FAILED WebhookEvent record captures it for investigation.
      res.status(200).json({ status: "FAILED" });
    }
  }
);
