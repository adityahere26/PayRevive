// JWT authentication middleware. Verifies the token and attaches req.merchant = { id,
// isDemo } — nothing else. Every downstream authorization decision re-derives permissions
// from the database using req.merchant.id; the token itself never carries roles/permissions
// (CLAUDE.md core principle #3, SECURITY.md § Authorization / IDOR prevention).

import jwt from "jsonwebtoken";
import { verifyMerchantToken } from "../lib/jwt.js";
import { UnauthorizedError, NotFoundError } from "../lib/errors.js";

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    next(new UnauthorizedError("MISSING_TOKEN", "Missing or malformed Authorization header"));
    return;
  }

  try {
    const payload = verifyMerchantToken(token);
    req.merchant = { id: payload.merchantId, isDemo: Boolean(payload.isDemo) };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("TOKEN_EXPIRED", "Session expired. Please sign in again."));
      return;
    }
    next(new UnauthorizedError("INVALID_TOKEN", "Invalid authentication token"));
  }
}

/**
 * Restricts a route to the pre-seeded demo merchant. Used to fence off the DEMO/TEST
 * data-creating routes (routes/demo.js — Simulate Payment Failure, seed, complete-test-payment)
 * so that on a live deployment a real merchant cannot inject synthetic cases or synthetic
 * recovered revenue into their own dashboard; their failures only ever arrive via the Razorpay
 * inbound webhook. Responds 404 rather than 403 so the route's existence isn't advertised.
 * Must run after requireAuth (needs req.merchant).
 */
export function requireDemoMerchant(req, _res, next) {
  if (!req.merchant?.isDemo) {
    next(new NotFoundError("Not found"));
    return;
  }
  next();
}
