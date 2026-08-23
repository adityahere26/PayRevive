// JWT signing/verification. Kept as a thin, dedicated wrapper — CLAUDE.md § definition of
// done requires authentication to stay separate from business logic and from route handlers.

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const DEMO_TOKEN_TTL = "2h"; // SECURITY.md § Demo authentication
export const MERCHANT_TOKEN_TTL = "7d"; // SECURITY.md § Authentication (not issued yet — no
// login endpoint exists in the Day 2 foundation, but the constant lives here so the real
// login flow doesn't have to re-derive it later).

/**
 * Signs a merchant JWT with the minimum necessary claims: which merchant this is, and
 * whether it's the isolated demo merchant. Never put PII, roles, or permissions in the
 * token — authorization is always re-derived server-side from the database, per
 * SECURITY.md § Authorization / IDOR prevention.
 */
export function signMerchantToken({ merchantId, isDemo = false }, { expiresIn }) {
  return jwt.sign({ merchantId, isDemo }, env.JWT_SECRET, { expiresIn });
}

/**
 * Verifies a JWT and returns its payload, or throws. Callers (middleware/auth.js) decide
 * how to translate a thrown error into an HTTP response.
 */
export function verifyMerchantToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
