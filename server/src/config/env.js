// Centralized environment configuration + startup validation. Imported once; every other
// module reads config from here rather than touching process.env directly, so there is one
// place that knows what's required (CLAUDE.md § definition of done: deterministic, testable
// core). Fails fast and loudly if a required variable is missing — never falls back to a
// hardcoded secret default.

import dotenv from "dotenv";

dotenv.config();

const REQUIRED = ["NODE_ENV", "PORT", "MONGODB_URI", "JWT_SECRET", "CLIENT_URL"];

// Not required for the deterministic pipeline (no AI or Razorpay calls happen from it — see
// AGENT_DESIGN.md / RECOVERY_POLICY.md). Missing values only produce a startup warning so the
// deterministic test suite never needs a real Gemini/Razorpay credential. GEMINI_API_KEY is
// payrevive's sole runtime AI provider credential — see CLAUDE.md § AI provider; Claude Code
// (this development tool) has no runtime footprint and is unrelated to this variable.
const OPTIONAL_FOR_NOW = [
  "GEMINI_API_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

// Day 6 § Test Mode enforcement — "Add configuration validation that makes accidental live
// credentials difficult/impossible." Razorpay's own key-id convention prefixes every key with
// rzp_test_ (Test Mode) or rzp_live_ (Live Mode) — verified against current Razorpay docs. This
// build never uses Live Mode, so a configured key that isn't test-mode-shaped is a hard startup
// failure, not a warning — the same "fail fast and loudly" posture as a missing required var.
function assertRazorpayTestMode(keyId) {
  if (keyId && !keyId.startsWith("rzp_test_")) {
    throw new Error(
      "RAZORPAY_KEY_ID is not a Test Mode key (must start with rzp_test_). Live Razorpay " +
        "credentials are not permitted in this build — see CLAUDE.md § Test Mode Only."
    );
  }
}

function loadEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill them in."
    );
  }

  assertRazorpayTestMode(process.env.RAZORPAY_KEY_ID);

  const missingOptional = OPTIONAL_FOR_NOW.filter((key) => !process.env[key]);
  if (missingOptional.length > 0 && process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Not set (fine for the Day 2 foundation, required later): ${missingOptional.join(", ")}`
    );
  }

  return {
    NODE_ENV: process.env.NODE_ENV,
    PORT: Number(process.env.PORT),
    MONGODB_URI: process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_URL: process.env.CLIENT_URL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
    // Optional override for the Gemini model id used by every AI Decision/Planner call
    // (server/src/ai/gemini/client.js). Lets ops correct a retired/renamed model on the
    // hosting platform without a code change — Gemini's 404 body names the current model to
    // use. Falls back to a stable default in client.js when unset.
    GEMINI_MODEL: process.env.GEMINI_MODEL || null,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || null,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || null,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || null,
    // Approval-gated autonomy (ARCHITECTURE.md § Recovery plans): when a PAYMENT_FAILURE
    // recovery case is created, immediately run it through the SAME deterministic evaluate
    // pipeline and record the decision as an item on the merchant's recovery plan — but do NOT
    // contact the customer. Customer-facing actions execute only after the merchant confirms
    // the plan. On by default; set RECOVERY_AUTOPLAN_ENABLED=false to disable auto-planning and
    // build plans purely on demand. The shared test harness forces this off for step-by-step
    // determinism (see tests/testUtils/testServer.js); tests/recoveryPlan.test.js opts back in.
    RECOVERY_AUTOPLAN_ENABLED: process.env.RECOVERY_AUTOPLAN_ENABLED !== "false",
  };
}

export const env = loadEnv();
