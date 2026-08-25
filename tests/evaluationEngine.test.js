// Tests for the batch evaluation engine (evaluation/batchEvaluator.js,
// evaluation/datasetGenerator.js) and its HTTP surface (server/src/routes/evaluation.js) —
// see EVALUATION.md § Batch evaluation engine. Covers: the engine's own reproducibility
// guarantee, the "never calls Gemini/Razorpay" property, the API happy path, merchant
// isolation (SECURITY.md § Authorization / IDOR prevention), and the policy-blocking
// behavior (high-value cases always escalate, never execute autonomously).

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils/testServer.js";
import { runBatchEvaluation } from "../evaluation/batchEvaluator.js";
import { generateSyntheticCases } from "../evaluation/datasetGenerator.js";

const DEFAULT_POLICY = {
  maxRecoveryAttempts: 2,
  maxVoiceAttempts: 1,
  maxAutonomousAmount: 50000,
  recoveryWindowHours: 72,
  optOutBehavior: "DO_NOT_CONTACT",
  maxContactAttempts: 2,
  voiceEnabled: true,
};

// ---- Pure engine tests — no HTTP, no DB -----------------------------------------------

// scoringEngine.js's recencyFactor intentionally reads the real wall clock
// (Date.now() - createdAt) — untouched, frozen pipeline code — so two runs executed at
// different real instants carry a sub-billionth-scale floating-point epsilon in
// recoveryProbability alone. That's the recency factor doing exactly what it's designed to
// do, not a determinism bug: every seed/RNG-driven decision (which archetype, which outcome,
// which status) is still identical. Round before comparing so the assertion tests what
// EVALUATION.md § Reproducibility actually promises.
function normalizeCase(c) {
  return { ...c, recoveryProbability: c.recoveryProbability == null ? c.recoveryProbability : Math.round(c.recoveryProbability * 1e6) / 1e6 };
}

test("engine: same seed + count produces reproducible metrics and cases (EVALUATION.md § Reproducibility)", () => {
  const a = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 42, count: 60 });
  const b = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 42, count: 60 });
  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.cases.map(normalizeCase), b.cases.map(normalizeCase));
});

test("engine: a different seed produces a different (but still valid) run", () => {
  const a = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 1, count: 60 });
  const b = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 2, count: 60 });
  assert.notDeepEqual(a.metrics, b.metrics);
});

test("engine: recoveredRevenue is exactly the sum of recoveredAmount across RECOVERED cases — never fabricated", () => {
  const { metrics, cases } = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 7, count: 120 });
  const expected = cases.filter((c) => c.status === "RECOVERED").reduce((sum, c) => sum + c.recoveredAmount, 0);
  assert.equal(metrics.recoveredRevenue, expected);
  // Every RECOVERED case's recoveredAmount equals its own amount (Action Executor invariant).
  for (const c of cases) {
    if (c.status === "RECOVERED") assert.equal(c.recoveredAmount, c.amount);
    if (c.status !== "RECOVERED") assert.equal(c.recoveredAmount, 0);
  }
});

test("engine: high-value cases always escalate — never executed autonomously, regardless of window/attempts/history", () => {
  const { cases } = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 99, count: 60 });
  const highValueCases = cases.filter((c) => c.amount > DEFAULT_POLICY.maxAutonomousAmount);
  assert.ok(highValueCases.length > 0, "dataset generator produces at least one high-value case");
  for (const c of highValueCases) {
    assert.equal(c.status, "ESCALATED");
    assert.equal(c.policyDecision, "HIGH_VALUE_REQUIRES_REVIEW");
    assert.equal(c.executed, false);
    assert.equal(c.recoveredAmount, 0);
  }
});

test("engine: policyViolations is always 0 — every executed action was POLICY_APPROVED first", () => {
  const { metrics } = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 5, count: 150 });
  assert.equal(metrics.policyViolations, 0);
});

test("engine: dataset generator produces every documented archetype at least once when count >= archetype count", () => {
  const cases = generateSyntheticCases({ seed: 3, count: 40, policy: DEFAULT_POLICY });
  const archetypeIds = new Set(cases.map((c) => c.archetypeId));
  assert.ok(archetypeIds.size >= 11, `expected at least 11 distinct archetypes, got ${archetypeIds.size}`);
});

test("engine: opted-out customers always stop — OPT_OUT_BEHAVIOR wins regardless of amount/probability (RECOVERY_POLICY.md precedence)", () => {
  const { cases } = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 11, count: 100 });
  const optedOutCases = cases.filter((c) => c.archetypeId === "OPTED_OUT");
  assert.ok(optedOutCases.length > 0, "dataset generator produces at least one opted-out case");
  for (const c of optedOutCases) {
    assert.equal(c.status, "STOPPED");
    assert.equal(c.policyDecision, "OPT_OUT_BEHAVIOR");
    assert.equal(c.recoveredAmount, 0);
  }
});

test("engine: approvedCases counts every case that reached POLICY_APPROVED (STOP-approved included), actionsExecuted counts only non-STOP", () => {
  const { metrics, cases } = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 21, count: 100 });
  const expectedApproved = cases.filter((c) => c.executed).length;
  const expectedNonStopExecuted = cases.filter((c) => c.executed && c.selectedIntervention !== "STOP").length;
  assert.equal(metrics.approvedCases, expectedApproved);
  assert.equal(metrics.actionsExecuted, expectedNonStopExecuted);
  assert.ok(metrics.approvedCases >= metrics.actionsExecuted);
});

test("engine: archetypeBreakdown partitions every case exactly once and its revenue sums to totalRevenueAtRisk", () => {
  const { metrics } = runBatchEvaluation({ policy: DEFAULT_POLICY, seed: 33, count: 100 });
  const groups = Object.values(metrics.archetypeBreakdown);
  const countSum = groups.reduce((sum, g) => sum + g.count, 0);
  const revenueSum = groups.reduce((sum, g) => sum + g.revenue, 0);
  assert.equal(countSum, metrics.totalCases);
  assert.equal(revenueSum, metrics.totalRevenueAtRisk);
  // Every archetype the generator can produce is represented (count=100 > 11 archetypes).
  assert.equal(Object.keys(metrics.archetypeBreakdown).length, 11);
  // Each group's recoveredRevenue can never exceed its own revenue.
  for (const g of groups) {
    assert.ok(g.recoveredRevenue <= g.revenue);
  }
});

test("engine: imports only deterministic pipeline modules — never the Razorpay/Gemini integrations or fetch (module-level static check)", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../evaluation/batchEvaluator.js", import.meta.url), "utf8");
  const importLines = source.match(/^import .+$/gm) || [];
  for (const line of importLines) {
    assert.doesNotMatch(line, /integrations\/razorpay|ai\/gemini|@google\/genai/i);
  }
  assert.doesNotMatch(source, /\bfetch\(/);
});

// ---- HTTP surface -----------------------------------------------------------------------

let ctx;

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  const { Merchant, EvaluationRun } = ctx.models;
  await Promise.all([Merchant.deleteMany({}), EvaluationRun.deleteMany({})]);
});

async function demoToken() {
  const res = await fetch(`${ctx.baseUrl}/api/auth/demo`, { method: "POST" });
  return res.json();
}

async function authedFetch(path, token, opts = {}) {
  return fetch(`${ctx.baseUrl}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
}

test("POST /api/evaluation/run requires authentication", async () => {
  const res = await fetch(`${ctx.baseUrl}/api/evaluation/run`, { method: "POST" });
  assert.equal(res.status, 401);
});

test("POST /api/evaluation/run (happy path): creates a persisted EvaluationRun with consistent aggregates", async () => {
  const { token, merchant } = await demoToken();

  const res = await authedFetch("/api/evaluation/run", token, {
    method: "POST",
    body: JSON.stringify({ count: 40 }),
  });
  assert.equal(res.status, 201);
  const { evaluationRun } = await res.json();

  assert.equal(evaluationRun.totalCases, 40);
  assert.equal(String(evaluationRun.merchantId), String(merchant.id));
  assert.equal(evaluationRun.metrics.totalCases, 40);
  assert.equal(evaluationRun.metrics.cases.length, 40);
  assert.ok(evaluationRun.metrics.totalRevenueAtRisk > 0);
  assert.equal(evaluationRun.metrics.policyViolations, 0);

  const { EvaluationRun } = ctx.models;
  const stored = await EvaluationRun.findById(evaluationRun._id);
  assert.ok(stored, "run was actually persisted");
  assert.equal(stored.totalCases, 40);
});

test("POST /api/evaluation/run rejects an out-of-range count instead of silently clamping", async () => {
  const { token } = await demoToken();
  const res = await authedFetch("/api/evaluation/run", token, {
    method: "POST",
    body: JSON.stringify({ count: 5000 }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/evaluation lists only the caller's own runs, most recent first, without per-case detail", async () => {
  const { token } = await demoToken();
  await authedFetch("/api/evaluation/run", token, { method: "POST", body: JSON.stringify({ count: 20 }) });
  await authedFetch("/api/evaluation/run", token, { method: "POST", body: JSON.stringify({ count: 20 }) });

  const res = await authedFetch("/api/evaluation", token);
  assert.equal(res.status, 200);
  const { evaluationRuns } = await res.json();
  assert.equal(evaluationRuns.length, 2);
  assert.equal(evaluationRuns[0].metrics.cases, undefined);
  assert.ok(new Date(evaluationRuns[0].createdAt) >= new Date(evaluationRuns[1].createdAt));
});

test("GET /api/evaluation/:id returns full per-case detail for the caller's own run", async () => {
  const { token } = await demoToken();
  const createRes = await authedFetch("/api/evaluation/run", token, {
    method: "POST",
    body: JSON.stringify({ count: 25 }),
  });
  const { evaluationRun } = await createRes.json();

  const res = await authedFetch(`/api/evaluation/${evaluationRun._id}`, token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.evaluationRun.metrics.cases.length, 25);
});

test("GET /api/evaluation/:id 404s (never 403) for a run belonging to a different merchant — IDOR prevention", async () => {
  const { signMerchantToken, DEMO_TOKEN_TTL } = await import("../server/src/lib/jwt.js");
  const { Merchant } = ctx.models;

  const { token: tokenA } = await demoToken();
  const createRes = await authedFetch("/api/evaluation/run", tokenA, {
    method: "POST",
    body: JSON.stringify({ count: 20 }),
  });
  const { evaluationRun } = await createRes.json();

  const merchantB = await Merchant.create({ email: "eval-merchant-b@test.payrevive.dev", name: "Merchant B" });
  const tokenB = signMerchantToken({ merchantId: merchantB._id.toString(), isDemo: false }, { expiresIn: DEMO_TOKEN_TTL });

  const res = await authedFetch(`/api/evaluation/${evaluationRun._id}`, tokenB);
  assert.equal(res.status, 404);
});

test("evaluation runs never create real recovery_cases/audit_logs documents — a run cannot pollute the live dashboard", async () => {
  const { token } = await demoToken();
  const { RecoveryCase, AuditLog } = ctx.models;

  await authedFetch("/api/evaluation/run", token, { method: "POST", body: JSON.stringify({ count: 50 }) });

  assert.equal(await RecoveryCase.countDocuments({}), 0);
  assert.equal(await AuditLog.countDocuments({}), 0);
});
