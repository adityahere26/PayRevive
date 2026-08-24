// CLAUDE.md § Day 6 requirement 12 — "If RAZORPAY_KEY_ID is configured, require rzp_test_
// prefix." config/env.js's assertRazorpayTestMode runs once, at module import time, inside
// loadEnv() — so this MUST be its own test file (node --test gives each file its own process;
// import()ing config/env.js a second time within the SAME process would return the cached
// module rather than re-running validation, per tests/testUtils/testServer.js's own comment on
// why each file gets independent state).

import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";

test("a configured RAZORPAY_KEY_ID that is NOT Test Mode-shaped (rzp_live_) fails startup, never boots", async () => {
  await assert.rejects(
    () =>
      startTestServer({
        envOverrides: {
          RAZORPAY_KEY_ID: "rzp_live_shouldneverbeaccepted",
          RAZORPAY_KEY_SECRET: "fake-secret",
        },
      }),
    /Test Mode/
  );
});
