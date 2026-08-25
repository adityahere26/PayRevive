// ARCHITECTURE.md § API contract — GET /api/dashboard/summary: primary + secondary metrics
// for the authenticated merchant. Aggregation pipelines are $match-scoped by merchantId as an
// ObjectId (mongoose aggregate does not auto-cast query strings the way find() does), keeping
// merchant isolation intact for aggregated reads too.

import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { RecoveryCase } from "../models/index.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res, next) => {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.merchant.id);

    const [riskAgg, recoveredAgg, statusCounts, revenueByStatusAgg, interventionAgg, recentCases] = await Promise.all([
      RecoveryCase.aggregate([
        { $match: { merchantId } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      RecoveryCase.aggregate([
        { $match: { merchantId, status: "RECOVERED" } },
        { $group: { _id: null, totalRecovered: { $sum: "$recoveredAmount" }, count: { $sum: 1 } } },
      ]),
      RecoveryCase.aggregate([{ $match: { merchantId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      // Revenue (not just case count) per status — powers the Dashboard's "Recovery
      // Performance" breakdown without fabricating any time-series (ARCHITECTURE.md has no
      // historical/bucketed data to draw one from honestly).
      RecoveryCase.aggregate([
        { $match: { merchantId } },
        { $group: { _id: "$status", revenue: { $sum: "$amount" } } },
      ]),
      // Grouped by the intervention the Policy Engine actually approved — same shape as the
      // Evaluation engine's recoveryByIntervention (evaluation/batchEvaluator.js) so the two
      // views render identically, but this is real merchant data only: RecoveryCase docs are
      // never created by the evaluation engine (it never persists synthetic cases), so this
      // aggregation structurally cannot include synthetic/simulated-run data.
      RecoveryCase.aggregate([
        { $match: { merchantId, selectedIntervention: { $ne: null } } },
        {
          $group: {
            _id: "$selectedIntervention",
            count: { $sum: 1 },
            revenue: { $sum: "$amount" },
            recoveredRevenue: {
              $sum: { $cond: [{ $eq: ["$status", "RECOVERED"] }, "$recoveredAmount", 0] },
            },
          },
        },
      ]),
      RecoveryCase.find({ merchantId }).sort({ createdAt: -1 }).limit(10),
    ]);

    const statusBreakdown = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
    const revenueByStatus = Object.fromEntries(revenueByStatusAgg.map((s) => [s._id, s.revenue]));
    const interventionBreakdown = Object.fromEntries(
      interventionAgg.map((g) => [
        g._id,
        {
          count: g.count,
          revenue: g.revenue,
          recoveredRevenue: g.recoveredRevenue,
          recoveryRate: g.revenue > 0 ? g.recoveredRevenue / g.revenue : 0,
        },
      ])
    );

    res.status(200).json({
      revenueAtRisk: riskAgg[0]?.totalAmount || 0,
      totalCases: riskAgg[0]?.count || 0,
      recoveredRevenue: recoveredAgg[0]?.totalRecovered || 0,
      recoveredCases: recoveredAgg[0]?.count || 0,
      casesRequiringReview: statusBreakdown.ESCALATED || 0,
      statusBreakdown,
      revenueByStatus,
      interventionBreakdown,
      recentCases,
    });
  } catch (err) {
    next(err);
  }
});
