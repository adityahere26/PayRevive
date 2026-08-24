// ARCHITECTURE.md § API contract. Every route here is merchant-scoped: the list route filters
// by req.merchant.id at the query level, and every :id route runs through
// requireMerchantOwnership so a case belonging to another merchant 404s exactly like one that
// doesn't exist (SECURITY.md § Authorization / IDOR prevention) — never a 403 that would
// confirm existence.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireMerchantOwnership } from "../middleware/authorize.js";
import { recoveryCaseActionRateLimiter } from "../middleware/rateLimit.js";
import { ApiError, ConflictError, NotFoundError } from "../lib/errors.js";
import { RecoveryCase, RecoveryAction, Merchant, Customer, Payment, AuditLog } from "../models/index.js";
import { runEvaluationPipeline } from "../pipeline/orchestrator.js";
import { executeAction } from "../pipeline/actionExecutor.js";
import { getCustomerHistory, createLivePaymentLink } from "../pipeline/tools.js";
import { writeAuditLog, writeAuditLogs } from "../audit/auditLogger.js";
import { mulberry32, seedFromString } from "../lib/prng.js";
import { isRazorpayConfigured } from "../integrations/razorpay/client.js";
import { voiceRouter } from "./voice.js";

export const recoveryCasesRouter = Router();

recoveryCasesRouter.use(requireAuth);

// Voice routes (AGENT_DESIGN.md § Voice pipeline) share the exact same ownership check every
// other :id sub-route uses — mounted here, once, rather than repeated in voice.js.
recoveryCasesRouter.use("/:id/voice", requireMerchantOwnership(RecoveryCase), voiceRouter);

recoveryCasesRouter.get("/", async (req, res, next) => {
  try {
    const { status, sourceType } = req.query;
    const filter = { merchantId: req.merchant.id };
    if (status) filter.status = status;
    if (sourceType) filter.sourceType = sourceType;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const [cases, total] = await Promise.all([
      RecoveryCase.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      RecoveryCase.countDocuments(filter),
    ]);

    res.status(200).json({ cases, total, page, limit });
  } catch (err) {
    next(err);
  }
});

recoveryCasesRouter.get("/:id", requireMerchantOwnership(RecoveryCase), async (req, res) => {
  res.status(200).json({ recoveryCase: req.resource });
});

recoveryCasesRouter.get("/:id/audit", requireMerchantOwnership(RecoveryCase), async (req, res, next) => {
  try {
    const auditLog = await AuditLog.find({ caseId: req.resource._id, merchantId: req.merchant.id }).sort({
      timestamp: 1,
    });
    res.status(200).json({ auditLog });
  } catch (err) {
    next(err);
  }
});

// Runs Root Cause Analyzer -> Eligibility Engine -> Scoring Engine -> Intervention Selector
// -> Policy Engine (pipeline/orchestrator.js) and advances the case to POLICY_APPROVED or a
// terminal status. Safe to call repeatedly/idempotently — see orchestrator.js's re-entrancy
// note — which is what makes it the correct place for a retry (FAILED -> ANALYZING) to
// re-enter eligibility/policy (RECOVERY_POLICY.md § Policy precedence, "Retry re-entry").
recoveryCasesRouter.post(
  "/:id/evaluate",
  recoveryCaseActionRateLimiter,
  requireMerchantOwnership(RecoveryCase),
  async (req, res, next) => {
    try {
      const recoveryCase = req.resource;

      const [merchant, customer, payment] = await Promise.all([
        Merchant.findById(req.merchant.id),
        Customer.findOne({ _id: recoveryCase.customerId, merchantId: req.merchant.id }),
        recoveryCase.paymentId
          ? Payment.findOne({ _id: recoveryCase.paymentId, merchantId: req.merchant.id })
          : null,
      ]);
      if (!merchant || !customer) {
        next(new NotFoundError("Resource not found"));
        return;
      }

      const history = await getCustomerHistory(customer._id, req.merchant.id);

      const { auditEntries } = runEvaluationPipeline({
        recoveryCase,
        policy: merchant.policy,
        customer,
        payment,
        history,
      });

      await recoveryCase.save();

      if (auditEntries.length > 0) {
        await writeAuditLogs(
          auditEntries.map((entry) => ({
            merchantId: req.merchant.id,
            caseId: recoveryCase._id,
            actor: "SYSTEM",
            ...entry,
          }))
        );
      }

      res.status(200).json({ recoveryCase });
    } catch (err) {
      next(err);
    }
  }
);

// Action Executor (module 7), simulated only — see actionExecutor.js. Requires the case to
// already be POLICY_APPROVED (i.e. /evaluate has run and approved a candidate action); calling
// this on a case in any other status is a 409, not a silent no-op.
recoveryCasesRouter.post(
  "/:id/simulate-action",
  recoveryCaseActionRateLimiter,
  requireMerchantOwnership(RecoveryCase),
  async (req, res, next) => {
    try {
      const recoveryCase = req.resource;

      if (recoveryCase.status !== "POLICY_APPROVED") {
        next(
          new ConflictError(
            `Recovery case is not ready for action execution (status: ${recoveryCase.status})`
          )
        );
        return;
      }

      // Seeded per case+attempt, not Math.random() — CLAUDE.md § Deterministic randomness.
      // Keyed on `attempts` (not e.g. Date.now()) so the outcome is reproducible for a given
      // attempt number and only varies across genuinely distinct attempts.
      const rng = mulberry32(seedFromString(`${recoveryCase._id}:${recoveryCase.attempts}`));

      const selectedAction = recoveryCase.selectedIntervention;
      const result = executeAction({ recoveryCase, action: selectedAction, rng });

      await recoveryCase.save();

      await RecoveryAction.create({
        caseId: recoveryCase._id,
        merchantId: req.merchant.id,
        actionType: result.action,
        status: "SIMULATED",
        result: result.success === null ? result.outcome : result.success ? "SUCCESS" : "FAILURE",
        metadata: { simulated: true },
      });

      await writeAuditLog({
        merchantId: req.merchant.id,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: "ACTION_SIMULATED",
        reason: result.action,
        result: recoveryCase.status,
        metadata: { simulated: true, success: result.success },
      });

      res.status(200).json({ recoveryCase, action: result });
    } catch (err) {
      next(err);
    }
  }
);

// Day 6 — Razorpay Test Mode Payment Link. ARCHITECTURE.md's documented (not-yet-built) route.
// Distinct from /simulate-action: this makes a real Razorpay Test Mode API call. The Payment
// Link safety checklist (RECOVERY_POLICY.md) runs in order below, as defense-in-depth on top of
// the Policy Engine's own earlier APPROVE — never a substitute for it.
recoveryCasesRouter.post(
  "/:id/payment-link",
  recoveryCaseActionRateLimiter,
  requireMerchantOwnership(RecoveryCase),
  async (req, res, next) => {
    try {
      const recoveryCase = req.resource;

      // Checklist 3: not already RECOVERED.
      if (recoveryCase.status === "RECOVERED") {
        next(new ConflictError("This recovery case has already been recovered"));
        return;
      }

      // Checklist 4: idempotent reuse — a retry/double-click/refresh must never create a
      // second link for the same case.
      if (recoveryCase.razorpayPaymentLinkId) {
        res.status(200).json({
          recoveryCase,
          paymentLink: {
            id: recoveryCase.razorpayPaymentLinkId,
            shortUrl: recoveryCase.razorpayPaymentLinkShortUrl,
          },
          reused: true,
        });
        return;
      }

      // Checklist 5: Policy Engine has already resolved to APPROVE for CREATE_PAYMENT_LINK.
      if (recoveryCase.status !== "POLICY_APPROVED" || recoveryCase.selectedIntervention !== "CREATE_PAYMENT_LINK") {
        next(
          new ConflictError(
            `Recovery case is not approved for a payment link (status: ${recoveryCase.status}, intervention: ${recoveryCase.selectedIntervention})`
          )
        );
        return;
      }

      if (!isRazorpayConfigured()) {
        next(new ConflictError("Razorpay Test Mode is not configured on this server"));
        return;
      }

      const [merchant, customer] = await Promise.all([
        Merchant.findById(req.merchant.id),
        Customer.findOne({ _id: recoveryCase.customerId, merchantId: req.merchant.id }),
      ]);
      if (!merchant || !customer) {
        next(new NotFoundError("Resource not found"));
        return;
      }

      // Checklist 7/8: re-check window/attempts defensively, on top of the Policy Engine's
      // own gate (time may have passed since /evaluate ran).
      if (Date.now() > new Date(recoveryCase.recoveryWindowExpiresAt).getTime()) {
        next(new ConflictError("Recovery window has expired for this case"));
        return;
      }
      if (recoveryCase.attempts >= merchant.policy.maxRecoveryAttempts) {
        next(new ConflictError("Recovery attempt limit reached for this case"));
        return;
      }

      // Checklist 6 (amount is always the case's own stored value, never client-supplied) and
      // the atomic claim + Razorpay call happen inside this one shared function — the exact
      // same function routes/voice.js calls, so there is only one Razorpay-executing path.
      const outcome = await createLivePaymentLink({ recoveryCase, merchantId: req.merchant.id, customer });

      if (!outcome.ok) {
        if (outcome.code === "CLAIM_CONFLICT") {
          next(new ConflictError("Payment link creation is already in progress for this case. Please retry shortly."));
          return;
        }
        await writeAuditLog({
          merchantId: req.merchant.id,
          caseId: recoveryCase._id,
          actor: "SYSTEM",
          eventType: "PAYMENT_LINK_CREATION_FAILED",
          reason: "RAZORPAY_REQUEST_FAILED",
          result: recoveryCase.status,
          metadata: { razorpayStatus: outcome.error?.status || null },
        });
        next(new ApiError(502, "RAZORPAY_UNAVAILABLE", "Could not create a payment link right now. Please try again."));
        return;
      }

      if (outcome.reused) {
        res.status(200).json({ recoveryCase: outcome.recoveryCase, paymentLink: outcome.link, reused: true });
        return;
      }

      await outcome.recoveryCase.save();

      await RecoveryAction.create({
        caseId: outcome.recoveryCase._id,
        merchantId: req.merchant.id,
        actionType: "CREATE_PAYMENT_LINK",
        status: "LIVE_TEST_MODE",
        result: outcome.result?.outcome ?? outcome.recoveryCase.status,
        metadata: {
          live: true,
          razorpayPaymentLinkId: outcome.link.id,
          razorpayPaymentLinkShortUrl: outcome.link.shortUrl,
          razorpayStatus: outcome.link.status,
        },
      });

      await writeAuditLog({
        merchantId: req.merchant.id,
        caseId: outcome.recoveryCase._id,
        actor: "SYSTEM",
        eventType: "PAYMENT_LINK_CREATED",
        reason: "CREATE_PAYMENT_LINK",
        result: outcome.recoveryCase.status,
        metadata: { razorpayPaymentLinkId: outcome.link.id, live: true },
      });

      res.status(201).json({ recoveryCase: outcome.recoveryCase, paymentLink: outcome.link });
    } catch (err) {
      next(err);
    }
  }
);
