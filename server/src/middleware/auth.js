// JWT authentication middleware. Verifies the token and attaches req.merchant = { id,
// isDemo } — nothing else. Every downstream authorization decision re-derives permissions
// from the database using req.merchant.id; the token itself never carries roles/permissions
// (CLAUDE.md core principle #3, SECURITY.md § Authorization / IDOR prevention).

import jwt from "jsonwebtoken";
import { verifyMerchantToken } from "../lib/jwt.js";
import { UnauthorizedError } from "../lib/errors.js";

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
