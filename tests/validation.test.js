// Exercises the real AJV validation middleware (lib/validate.js) against a throwaway route.
// No business route takes a request body yet (Day 2 foundation), so this proves the
// reusable building block works before Day 3's resource routes reuse it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/unused-not-connected";
process.env.JWT_SECRET = "test-only-jwt-secret-never-use-outside-tests";
process.env.CLIENT_URL = "http://localhost:5173";

let server;
let baseUrl;

before(async () => {
  const { validateBody } = await import("../server/src/lib/validate.js");
  const { errorHandler } = await import("../server/src/middleware/errorHandler.js");

  const schema = {
    type: "object",
    properties: { promisedDate: { type: "string" } },
    required: ["promisedDate"],
    additionalProperties: false,
  };

  const app = express();
  app.use(express.json());
  app.post("/api/test/echo", validateBody(schema), (req, res) => res.status(200).json(req.body));
  app.use(errorHandler);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("a body matching the schema passes through", async () => {
  const res = await fetch(`${baseUrl}/api/test/echo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promisedDate: "2026-08-24" }),
  });
  assert.equal(res.status, 200);
});

test("a body missing a required field is rejected with a structured 400", async () => {
  const res = await fetch(`${baseUrl}/api/test/echo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(!body.error.stack);
});
