// SECURITY.md § Demo authentication. Only the demo entry point exists in the Day 2
// foundation — real merchant registration/login is out of scope until the architecture
// calls for it.

import { Router } from "express";
import { Merchant } from "../models/index.js";
import { getOrCreateDemoMerchant } from "../services/demoMerchant.js";
import { signMerchantToken, DEMO_TOKEN_TTL } from "../lib/jwt.js";
import { demoAuthRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFoundError } from "../lib/errors.js";

export const authRouter = Router();

authRouter.post("/demo", demoAuthRateLimiter, async (_req, res, next) => {
  try {
    const merchant = await getOrCreateDemoMerchant();

    // Same authorization scope/claims shape as a real merchant token — no elevated or
    // reduced privileges (SECURITY.md § Demo authentication).
    const token = signMerchantToken(
      { merchantId: merchant._id.toString(), isDemo: true },
      { expiresIn: DEMO_TOKEN_TTL }
    );

    res.status(200).json({
      token,
      expiresIn: DEMO_TOKEN_TTL,
      merchant: { id: merchant._id, name: merchant.name, isDemo: merchant.isDemo },
    });
  } catch (err) {
    next(err);
  }
});

// Demonstrates merchant identity extraction from a verified token — every authenticated
// route downstream follows this same requireAuth -> req.merchant.id pattern.
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const merchant = await Merchant.findById(req.merchant.id);
    if (!merchant) {
      next(new NotFoundError("Merchant not found"));
      return;
    }
    res.status(200).json({
      id: merchant._id,
      name: merchant.name,
      email: merchant.email,
      isDemo: merchant.isDemo,
    });
  } catch (err) {
    next(err);
  }
});
