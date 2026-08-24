// ARCHITECTURE.md § API contract. Every route here is merchant-scoped: the list route filters
// by req.merchant.id at the query level, and every :id route runs through
// requireMerchantOwnership so a case belonging to another merchant 404s exactly like one that
// doesn't exist (SECURITY.md § Authorization / IDOR prevention) — never a 403 that would
// confirm existence.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireMerchantOwnership } from "../middleware/authorize.js";
import { recoveryCaseActionRateLimiter } from "../middleware/rateLimit.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { RecoveryCase, RecoveryAction, Merchant, Customer, Payment, AuditLog } from "../models/index.js";
import { runEvaluationPipeline } from "../pipeline/orchestrator.js";
import { executeAction } from "../pipeline/actionExecutor.js";
import { getCustomerHistory } from "../pipeline/tools.js";
import { writeAuditLog, writeAuditLogs } from "../audit/auditLogger.js";
import { mulberry32, seedFromString } from "../lib/prng.js";

export const recoveryCasesRouter = Router();

recoveryCasesRouter.use(requireAuth);

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
