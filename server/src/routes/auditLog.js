// AGENT_DESIGN.md § The ten modules (Audit Logger) / CLAUDE.md core principle #4: "If it's
// not audited, it didn't happen." This is the merchant-wide counterpart to the existing
// per-case GET /api/recovery-cases/:id/audit (routes/recoveryCases.js) — same AuditLog
// collection, same audit/auditLogger.js writer, no second audit system. Every query below is
// scoped by merchantId at the query level (never filtered after the fact), matching every
// other list route in this codebase (SECURITY.md § Authorization / IDOR prevention).

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { AuditLog } from "../models/index.js";

export const auditLogRouter = Router();

auditLogRouter.use(requireAuth);

auditLogRouter.get("/", async (req, res, next) => {
  try {
    const merchantId = req.merchant.id;
    const { eventType, caseId, search } = req.query;

    // A malformed id would otherwise throw a CastError inside find() (unlike aggregate()) —
    // treat it as "no matches" rather than a 500.
    if (caseId && !/^[0-9a-fA-F]{24}$/.test(caseId)) {
      res.status(200).json({ events: [], total: 0, page: 1, limit: 25, eventTypes: [] });
      return;
    }

    const filter = { merchantId };
    if (eventType) filter.eventType = eventType;
    if (caseId) filter.caseId = caseId;
    // Simple, read-only substring match over reason/eventType — not a duplicate policy/audit
    // system, just a query-time filter over the existing collection.
    if (search) {
      const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ eventType: pattern }, { reason: pattern }, { result: pattern }];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    const [events, total, eventTypes] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(filter),
      // Powers the filter dropdown with only the event types this merchant actually has —
      // never a hardcoded list that could drift from what the pipeline actually emits.
      AuditLog.distinct("eventType", { merchantId }),
    ]);

    res.status(200).json({ events, total, page, limit, eventTypes: eventTypes.sort() });
  } catch (err) {
    next(err);
  }
});
