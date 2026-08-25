// ARCHITECTURE.md § API contract — POST /api/evaluation/run, GET /api/evaluation/:id.
// EVALUATION.md § Batch evaluation engine: runs the real recovery pipeline
// (evaluation/batchEvaluator.js -> server/src/pipeline) against a seeded synthetic dataset,
// never Gemini/Razorpay/a real voice session. Every run is persisted as a merchant-scoped
// EvaluationRun document so results survive a page reload without re-running.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireMerchantOwnership } from "../middleware/authorize.js";
import { validateBody } from "../lib/validate.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { NotFoundError } from "../lib/errors.js";
import { Merchant, EvaluationRun } from "../models/index.js";
import { seedFromString } from "../lib/prng.js";
import { runBatchEvaluation } from "../../../evaluation/batchEvaluator.js";

export const evaluationRouter = Router();

evaluationRouter.use(requireAuth);

// Same rationale as recoveryCaseActionRateLimiter (middleware/rateLimit.js) — a
// state-changing, CPU-bearing action. That file's own comment already anticipated this exact
// route ("evaluation/run") as a later addition.
const evaluationRunRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many evaluation runs. Please try again shortly.",
});

const runEvaluationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Kept modest (max 500) so a run stays a synchronous, sub-second in-memory computation —
    // see evaluation/README.md for how this differs from EVALUATION.md's full 500-1000 case spec.
    count: { type: "integer", minimum: 20, maximum: 500 },
  },
};

evaluationRouter.get("/", async (req, res, next) => {
  try {
    const runs = await EvaluationRun.find({ merchantId: req.merchant.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    // List view: aggregates only, per-case detail is fetched via GET /:id to keep this
    // response small regardless of how many cases each run evaluated.
    const evaluationRuns = runs.map(({ metrics, ...rest }) => ({
      ...rest,
      metrics: metrics ? { ...metrics, cases: undefined } : metrics,
    }));
    res.status(200).json({ evaluationRuns });
  } catch (err) {
    next(err);
  }
});

evaluationRouter.get("/:id", requireMerchantOwnership(EvaluationRun), async (req, res) => {
  res.status(200).json({ evaluationRun: req.resource });
});

evaluationRouter.post(
  "/run",
  evaluationRunRateLimiter,
  validateBody(runEvaluationSchema),
  async (req, res, next) => {
    try {
      const merchant = await Merchant.findById(req.merchant.id);
      if (!merchant) {
        next(new NotFoundError("Merchant not found"));
        return;
      }

      const count = req.body?.count || 100;
      const seed = seedFromString(`${req.merchant.id}:${Date.now()}`);

      const { metrics, cases } = runBatchEvaluation({ policy: merchant.policy, seed, count });

      const evaluationRun = await EvaluationRun.create({
        merchantId: merchant._id,
        seed,
        totalCases: count,
        metrics: { ...metrics, cases },
      });

      res.status(201).json({ evaluationRun });
    } catch (err) {
      next(err);
    }
  }
);
