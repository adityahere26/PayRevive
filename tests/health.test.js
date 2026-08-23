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

test("GET /api/health reports ok + connected when the database is reachable", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/health`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.database, "connected");
  assert.equal(body.environment, "test");
  assert.ok(typeof body.timestamp === "string" && !Number.isNaN(Date.parse(body.timestamp)));

  // Never expose secrets/connection strings in the health payload.
  const serialized = JSON.stringify(body).toLowerCase();
  assert.ok(!serialized.includes("mongodb://"));
  assert.ok(!serialized.includes("secret"));
});

test("unknown routes return a structured 404", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/this-route-does-not-exist`);
  assert.equal(res.status, 404);

  const body = await res.json();
  assert.equal(body.error.code, "NOT_FOUND");
  assert.ok(body.error.requestId, "error response should carry a requestId for correlation");
  assert.ok(!body.error.stack, "stack traces must never reach the client");
});
