// Exercises the REAL production middleware (middleware/auth.js + middleware/authorize.js)
// against a throwaway route, mounted only for this test — SECURITY.md § Authorization / IDOR
// prevention: a resource belonging to another merchant must 404, never 403, never leak data.
// Day 3 will mount requireMerchantOwnership on the real recovery-cases routes; this proves
// the reusable pattern itself works before that exists.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { startTestServer, TEST_JWT_SECRET } from "./testUtils/testServer.js";
import jwt from "jsonwebtoken";

let ctx;
let testServer;
let testBaseUrl;
let merchantA;
let merchantB;
let caseOwnedByA;

before(async () => {
  ctx = await startTestServer();

  const { Merchant, RecoveryCase } = ctx.models;
  const { requireAuth } = await import("../server/src/middleware/auth.js");
  const { requireMerchantOwnership } = await import("../server/src/middleware/authorize.js");
  const { errorHandler } = await import("../server/src/middleware/errorHandler.js");
  const { notFound } = await import("../server/src/middleware/notFound.js");
  const mongoose = (await import("mongoose")).default;

  merchantA = await Merchant.create({ email: "merchant-a@test.payrevive.dev", name: "Merchant A" });
  merchantB = await Merchant.create({ email: "merchant-b@test.payrevive.dev", name: "Merchant B" });

  caseOwnedByA = await RecoveryCase.create({
    merchantId: merchantA._id,
    customerId: new mongoose.Types.ObjectId(),
    sourceType: "PAYMENT_FAILURE",
    amount: 2999,
    recoveryWindowExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });

  const testApp = express();
  testApp.get(
    "/api/test/recovery-cases/:id",
    requireAuth,
    requireMerchantOwnership(RecoveryCase, { param: "id" }),
    (req, res) => res.status(200).json({ id: req.resource._id, amount: req.resource.amount })
  );
  testApp.use(notFound);
  testApp.use(errorHandler);

  testServer = testApp.listen(0);
  await new Promise((resolve) => testServer.once("listening", resolve));
  testBaseUrl = `http://127.0.0.1:${testServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => testServer.close(resolve));
  await ctx.stop();
});

function tokenFor(merchant) {
  return jwt.sign({ merchantId: merchant._id.toString(), isDemo: false }, TEST_JWT_SECRET, {
    expiresIn: "1h",
  });
}

test("a merchant can fetch its own recovery case", async () => {
  const res = await fetch(`${testBaseUrl}/api/test/recovery-cases/${caseOwnedByA._id}`, {
    headers: { Authorization: `Bearer ${tokenFor(merchantA)}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.amount, 2999);
});

test("a different merchant gets 404, not 403, and no data, for someone else's case", async () => {
  const res = await fetch(`${testBaseUrl}/api/test/recovery-cases/${caseOwnedByA._id}`, {
    headers: { Authorization: `Bearer ${tokenFor(merchantB)}` },
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.amount, undefined);
});

test("a malformed resource id also 404s rather than 500ing", async () => {
  const res = await fetch(`${testBaseUrl}/api/test/recovery-cases/not-a-valid-object-id`, {
    headers: { Authorization: `Bearer ${tokenFor(merchantA)}` },
  });
  assert.equal(res.status, 404);
});

test("no token at all is rejected before any database lookup happens", async () => {
  const res = await fetch(`${testBaseUrl}/api/test/recovery-cases/${caseOwnedByA._id}`);
  assert.equal(res.status, 401);
});
