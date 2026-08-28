// Shared test harness. `node --test` runs each test file in its own process, so each file
// that calls startTestServer() gets an independent in-memory MongoDB (mongodb-memory-server)
// and an independent copy of the app — no shared state or ordering dependence between files.
// This is what makes "Tests should be deterministic" (EVALUATION.md's principle, applied
// here to the foundation suite) actually true without needing real Atlas credentials.

import { MongoMemoryServer } from "mongodb-memory-server";

export const TEST_JWT_SECRET = "test-only-jwt-secret-never-use-outside-tests";
export const TEST_CLIENT_URL = "http://localhost:5173";

/**
 * Boots the real app (server/src/app.js) against a fresh in-memory MongoDB on an ephemeral
 * port. Env vars are set via dynamic import ordering (ESM static imports are hoisted, so
 * config/env.js must not be imported — even transitively — until these are set).
 */
export async function startTestServer({ mongoUri, envOverrides = {} } = {}) {
  const mem = mongoUri ? null : await MongoMemoryServer.create();
  const uri = mongoUri || mem.getUri();

  // Everything below can throw/reject (most notably: a deliberately invalid envOverrides
  // value making config/env.js's startup validation throw — see
  // tests/razorpayEnvValidation.test.js). If it does, `mem`'s mongod child process must still
  // be stopped before rethrowing — otherwise it's a leaked live process that keeps the test
  // runner's event loop (and thus the whole `node --test` run) alive indefinitely, which looks
  // exactly like a hang rather than a fast, clean test failure.
  try {
    process.env.NODE_ENV = "test";
    process.env.PORT = "0";
    process.env.MONGODB_URI = uri;
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.CLIENT_URL = TEST_CLIENT_URL;
    // Forced empty regardless of the real .env file on disk — dotenv.config() (called inside
    // config/env.js) never overrides a key already present in process.env, even an empty one,
    // so this guarantees every test run is offline with respect to Gemini (CLAUDE.md § Day 5:
    // "the normal test suite must not depend on a live Gemini API key") no matter what real
    // credential a developer has configured locally. A test that explicitly needs a truthy
    // value can still override it via envOverrides below.
    process.env.GEMINI_API_KEY = "";
    // Same reasoning as GEMINI_API_KEY above, applied to Razorpay (Day 6): a developer's real
    // local .env may have live-looking or test Razorpay credentials configured for the manual
    // demo flow — dotenv.config() (inside config/env.js) never overrides an already-set
    // process.env key, so forcing these empty here guarantees every test run is offline with
    // respect to Razorpay regardless of what's on disk. Tests that need "Razorpay configured"
    // behavior opt in explicitly via envOverrides with a fake rzp_test_ key + a mocked fetch.
    process.env.RAZORPAY_KEY_ID = "";
    process.env.RAZORPAY_KEY_SECRET = "";
    process.env.RAZORPAY_WEBHOOK_SECRET = "";
    // Agentic auto-recovery (server/src/pipeline/autoRecovery.js) is ON by default in a real
    // deployment, but the bulk of the suite exercises the DETECT -> EVALUATE -> EXECUTE stages
    // one step at a time and asserts the intermediate states. Forcing it off here keeps those
    // tests deterministic; tests/autoRecovery.test.js opts back in via envOverrides.
    process.env.AUTO_RECOVERY_ENABLED = "false";
    Object.assign(process.env, envOverrides);

    const dbModule = await import("../../server/src/config/db.js");
    const { createApp } = await import("../../server/src/app.js");
    const models = await import("../../server/src/models/index.js");

    await dbModule.connectDB(uri);

    const server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    async function stop() {
      await new Promise((resolve) => server.close(resolve));
      if (mem) {
        await dbModule.disconnectDB().catch(() => {});
        await mem.stop();
      }
    }

    return { baseUrl, models, dbModule, stop };
  } catch (err) {
    if (mem) await mem.stop().catch(() => {});
    throw err;
  }
}
