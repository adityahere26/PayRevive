// Reusable merchant-ownership check — SECURITY.md § Authorization / IDOR prevention: a
// resource that exists but belongs to a different merchant returns the same 404 as one that
// doesn't exist at all, never a 403. Every merchant-owned resource route (recovery cases,
// customers, payments, audit logs, evaluation runs — built in later phases) is expected to
// use this instead of re-implementing the same findById-then-check pattern.

import { NotFoundError } from "../lib/errors.js";

/**
 * requireMerchantOwnership(Model, { param }) — Express middleware factory. Looks up
 * Model.findOne({ _id: req.params[param], merchantId: req.merchant.id }) in one query
 * (never findById followed by a separate ownership check), attaches the match to
 * req.resource, or fails with 404.
 */
export function requireMerchantOwnership(Model, { param = "id" } = {}) {
  return async (req, _res, next) => {
    try {
      const doc = await Model.findOne({ _id: req.params[param], merchantId: req.merchant.id });
      if (!doc) {
        next(new NotFoundError("Resource not found"));
        return;
      }
      req.resource = doc;
      next();
    } catch (err) {
      // A malformed ObjectId throws a CastError — that's still "not found" from the
      // client's point of view, not a 500.
      if (err.name === "CastError") {
        next(new NotFoundError("Resource not found"));
        return;
      }
      next(err);
    }
  };
}
