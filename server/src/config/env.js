// Centralized environment configuration + startup validation. Imported once; every other
// module reads config from here rather than touching process.env directly, so there is one
// place that knows what's required (CLAUDE.md § definition of done: deterministic, testable
// core). Fails fast and loudly if a required variable is missing — never falls back to a
// hardcoded secret default.

import dotenv from "dotenv";

dotenv.config();

const REQUIRED = ["NODE_ENV", "PORT", "MONGODB_URI", "JWT_SECRET", "CLIENT_URL"];

// Not required for the Day 2 foundation (no AI or Razorpay calls happen yet — see
// AGENT_DESIGN.md / RECOVERY_POLICY.md). Missing values only produce a startup warning so
// foundation tests never need real OpenAI/Razorpay credentials.
const OPTIONAL_FOR_NOW = [
  "OPENAI_API_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

function loadEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill them in."
    );
  }

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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || null,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || null,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || null,
  };
}

export const env = loadEnv();
