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

    const [riskAgg, recoveredAgg, statusCounts, recentCases] = await Promise.all([
      RecoveryCase.aggregate([
        { $match: { merchantId } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      RecoveryCase.aggregate([
        { $match: { merchantId, status: "RECOVERED" } },
        { $group: { _id: null, totalRecovered: { $sum: "$recoveredAmount" }, count: { $sum: 1 } } },
      ]),
      RecoveryCase.aggregate([{ $match: { merchantId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      RecoveryCase.find({ merchantId }).sort({ createdAt: -1 }).limit(10),
    ]);

    const statusBreakdown = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));

    res.status(200).json({
      revenueAtRisk: riskAgg[0]?.totalAmount || 0,
      totalCases: riskAgg[0]?.count || 0,
      recoveredRevenue: recoveredAgg[0]?.totalRecovered || 0,
      recoveredCases: recoveredAgg[0]?.count || 0,
      casesRequiringReview: statusBreakdown.ESCALATED || 0,
      statusBreakdown,
      recentCases,
    });
  } catch (err) {
    next(err);
  }
});
