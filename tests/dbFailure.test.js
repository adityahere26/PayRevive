// ARCHITECTURE.md requires the server to stay up and report status honestly even when
// MongoDB is unreachable — GET /api/health exists specifically for this. This test points
// at a URI nothing is listening on, with a short serverSelectionTimeoutMS, and verifies the
// process doesn't crash and health reflects "disconnected"/"degraded".

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/unreachable";
process.env.JWT_SECRET = "test-only-jwt-secret-never-use-outside-tests";
process.env.CLIENT_URL = "http://localhost:5173";

let server;
let baseUrl;

before(async () => {
  const { connectDB } = await import("../server/src/config/db.js");
  const { createApp } = await import("../server/src/app.js");

  // Expected to reject — the point of this test is that the app keeps running anyway.
  await connectDB(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 500 }).catch(() => {});

  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("server stays up and health reports degraded/disconnected when MongoDB is unreachable", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200, "health endpoint itself must still respond");

  const body = await res.json();
  assert.equal(body.database, "disconnected");
  assert.equal(body.status, "degraded");
});
