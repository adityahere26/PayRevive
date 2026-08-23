// Isolated in its own file/process so its request count starts at zero regardless of what
// auth.test.js does (SECURITY.md § Rate limiting: POST /api/auth/demo is limited per-IP).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";

let ctx;

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

test("POST /api/auth/demo is rate limited per IP", async () => {
  const LIMIT = 20; // must match middleware/rateLimit.js's demoAuthRateLimiter `max`
  const responses = [];

  for (let i = 0; i < LIMIT + 1; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    responses.push(await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }));
  }

  const statuses = responses.map((r) => r.status);
  const within = statuses.slice(0, LIMIT);
  const over = statuses[LIMIT];

  assert.ok(
    within.every((s) => s === 200),
    `expected all ${LIMIT} requests within the limit to succeed, got: ${within}`
  );
  assert.equal(over, 429);

  const body = await responses[LIMIT].json();
  assert.equal(body.error.code, "RATE_LIMITED");
});
