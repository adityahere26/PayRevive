import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, TEST_JWT_SECRET } from "./testUtils/testServer.js";

let ctx;

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

test("POST /api/auth/demo issues a 2h-scoped token for the isolated demo merchant", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.expiresIn, "2h");
  assert.equal(body.merchant.isDemo, true);
  assert.equal(body.merchant.name, "payrevive Demo Merchant");

  const payload = jwt.verify(body.token, TEST_JWT_SECRET);
  assert.equal(payload.merchantId, body.merchant.id);
  assert.equal(payload.isDemo, true);

  const twoHoursInSeconds = 2 * 60 * 60;
  const actualTtl = payload.exp - payload.iat;
  assert.equal(actualTtl, twoHoursInSeconds);

  // Token claims are minimal — no role/permission fields (CLAUDE.md core principle #3).
  assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "isDemo", "merchantId"]);
});

test("demo auth is idempotent — repeated calls resolve to the same merchant, not duplicates", async () => {
  const first = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }).then((r) => r.json());
  const second = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }).then((r) => r.json());
  assert.equal(first.merchant.id, second.merchant.id);

  const count = await ctx.models.Merchant.countDocuments({ isDemo: true });
  assert.equal(count, 1);
});

test("a valid token authorizes GET /api/auth/me and never bypasses authorization scope", async () => {
  const { token, merchant } = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }).then((r) =>
    r.json()
  );

  const res = await fetch(`${ctx.baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.id, merchant.id);
  assert.equal(body.isDemo, true);
});

test("missing Authorization header is rejected", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/auth/me`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "MISSING_TOKEN");
});

test("an invalid/garbage token is rejected", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/auth/me`, {
    headers: { Authorization: "Bearer not-a-real-token" },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "INVALID_TOKEN");
});

test("an expired token is rejected even though it was validly signed", async () => {
  const expiredToken = jwt.sign(
    { merchantId: "000000000000000000000000", isDemo: true },
    TEST_JWT_SECRET,
    { expiresIn: "-10s" }
  );

  const res = await fetch(`${ctx.baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "TOKEN_EXPIRED");
});

test("a token signed with the wrong secret is rejected", async () => {
  const forgedToken = jwt.sign({ merchantId: "000000000000000000000000", isDemo: true }, "wrong-secret", {
    expiresIn: "2h",
  });

  const res = await fetch(`${ctx.baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "INVALID_TOKEN");
});

// The contract the DemoEntry flow relies on: every deliberate "Enter Demo" discards any
// stored token and calls POST /api/auth/demo, which ALWAYS mints a fresh token that
// authorizes /me — so an expired or garbage stored token can never strand the user on
// /dashboard, no matter what was left in localStorage from a previous visit.
for (const kind of ["expired", "garbage"]) {
  test(`stale-token recovery: a ${kind} token fails /auth/me, then a fresh demo token works`, async () => {
    const staleToken =
      kind === "expired"
        ? jwt.sign({ merchantId: "000000000000000000000000", isDemo: true }, TEST_JWT_SECRET, { expiresIn: "-1s" })
        : "clearly.not.a.jwt";

    const stale = await fetch(`${ctx.baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    assert.equal(stale.status, 401, "the dead token must be rejected, not silently trusted");

    const fresh = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" }).then((r) => r.json());
    assert.ok(fresh.token && fresh.token !== staleToken);

    const recovered = await fetch(`${ctx.baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${fresh.token}` },
    });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).isDemo, true);
  });
}
