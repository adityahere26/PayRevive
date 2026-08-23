// See SECURITY.md § Demo authentication and ARCHITECTURE.md § Database schema. The demo
// merchant is a single, stable, clearly-flagged record — find-or-create (upsert) so it's
// safe to call repeatedly (server restarts, reseeding) without creating duplicates or
// clobbering an existing document's _id (which would invalidate outstanding demo tokens).

import { Merchant } from "../models/index.js";

export const DEMO_MERCHANT_EMAIL = "demo@payrevive.dev";

export async function getOrCreateDemoMerchant() {
  const merchant = await Merchant.findOneAndUpdate(
    { email: DEMO_MERCHANT_EMAIL },
    {
      $setOnInsert: {
        email: DEMO_MERCHANT_EMAIL,
        name: "payrevive Demo Merchant",
        isDemo: true,
        // policy sub-document defaults (RECOVERY_POLICY.md) apply automatically
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return merchant;
}
