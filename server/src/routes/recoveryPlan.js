// ARCHITECTURE.md § Recovery plans. The merchant-facing surface for approval-gated autonomy:
// read the one prepared recovery plan, then confirm it once. Every route requires auth and is
// merchant-scoped (a plan owned by another merchant 404s exactly like a missing one —
// SECURITY.md § Authorization / IDOR prevention). No policy logic lives here; the confirm route
// delegates to pipeline/recoveryPlan.js, which reuses the shared policy engine.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireMerchantOwnership } from "../middleware/authorize.js";
import { recoveryCaseActionRateLimiter } from "../middleware/rateLimit.js";
import { RecoveryPlan } from "../models/index.js";
import { confirmRecoveryPlan, serializePlan } from "../pipeline/recoveryPlan.js";

export const recoveryPlanRouter = Router();

recoveryPlanRouter.use(requireAuth);

// GET /api/recovery-plan/current — the merchant's open plan (PENDING_APPROVAL), or the most
// recent plan if none is open, or null.
recoveryPlanRouter.get("/current", async (req, res, next) => {
  try {
    const plan =
      (await RecoveryPlan.findOne({ merchantId: req.merchant.id, status: "PENDING_APPROVAL" })) ||
      (await RecoveryPlan.findOne({ merchantId: req.merchant.id }).sort({ createdAt: -1 }));
    res.status(200).json({ plan: serializePlan(plan) });
  } catch (err) {
    next(err);
  }
});

recoveryPlanRouter.get("/:id", requireMerchantOwnership(RecoveryPlan), async (req, res) => {
  res.status(200).json({ plan: serializePlan(req.resource) });
});

// POST /api/recovery-plan/:id/confirm — the ONE merchant decision. Idempotent: a second
// confirmation returns the current plan state and triggers no further calls or payment links.
recoveryPlanRouter.post(
  "/:id/confirm",
  recoveryCaseActionRateLimiter,
  requireMerchantOwnership(RecoveryPlan),
  async (req, res, next) => {
    try {
      const result = await confirmRecoveryPlan({ planId: req.resource._id, merchantId: req.merchant.id });
      res.status(200).json({
        plan: serializePlan(result.plan),
        idempotent: Boolean(result.idempotent),
        expired: Boolean(result.expired),
      });
    } catch (err) {
      next(err);
    }
  }
);
