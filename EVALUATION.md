# EVALUATION.md — Synthetic Dataset and Batch Evaluation

## Purpose

Batch evaluation is the primary evidence of the system working "across a batch," as the track
requires. It runs the **actual production decision pipeline** (imported directly from
`server/src/pipeline/`) against a deterministic synthetic dataset (20–500 cases per run, default
100) and reports honestly measured outcomes — never a hand-picked or fabricated number. **Batch
evaluation never calls the Gemini API, never calls Razorpay, never starts a real voice session,
and never executes any real external recovery action** — every external call is substituted with
a deterministic, seeded simulation (`rng() < recoveryProbability`).

This separation is deliberate and load-bearing: the deterministic pipeline (Risk Detector →
Root Cause Analyzer → Eligibility Engine → Scoring Engine → Intervention Selector → Policy
Engine → Action Executor) is fully testable — in both the automated test suite and a batch
evaluation run — **without a live `GEMINI_API_KEY`**. The AI layer (`server/src/ai/`, see
`AGENT_DESIGN.md` § Provider abstraction) is a separate, independently tested module; a batch
run never calls it.

The shipped engine is `evaluation/datasetGenerator.js` + `evaluation/batchEvaluator.js`, wired
via `POST /api/evaluation/run` — see `evaluation/README.md` for the "About this run" note the UI
also shows.

## Synthetic dataset

- **Size:** 20–500 cases per run (default 100). Generated in memory per request; nothing is
  persisted per case (see § Batch evaluation engine).
- **Determinism:** generated from a seed using a hand-rolled seeded PRNG (mulberry32, no external
  dependency) — same seed + count always produces the same dataset, so evaluation runs are
  reproducible and diffable across code changes.
- **No real customer data** — all names, amounts, and identifiers are synthetic, generated from
  realistic Indian merchant/customer patterns, not sourced.

Case archetypes the generator produces (`datasetGenerator.js`): retryable / non-retryable
payment failures, repeat vs. first-time customers, high-value vs. low-value, prior recovery
successes/failures, opted-out customers, escalation cases (amount above threshold), stop cases
(refusal / non-retryable / window expired), and ambiguous cases (noisy signals, `UNKNOWN` root
cause, mid-band scores). Checkout-abandonment and Promise-to-Pay archetypes are not exercised
(neither scenario is wired in this build).

## Batch evaluation engine

`POST /api/evaluation/run` (rate-limited; body `{ count?: 20–500, seed? }`) generates the
dataset in memory, then for each case:

1. Runs it through the **real production pipeline**, imported directly from
   `server/src/pipeline/` — `runEvaluationPipeline` (Risk Detector → Root Cause Analyzer →
   Eligibility Engine → Scoring Engine → Intervention Selector → Policy Engine) then
   `executeAction`.
2. `executeAction` runs in its **simulated** mode (no `live` flag) for every action — Razorpay
   Payment Link creation, a browser voice session, and any Gemini call are all substituted with
   `rng() < recoveryProbability → recovered` using the seeded PRNG. It never calls Razorpay,
   never classifies a real transcript, never calls Gemini.
3. Per-case results are held **in memory only**; nothing is written to `recovery_cases` /
   `recovery_actions` / `audit_logs`.
4. Aggregate metrics are computed and stored as one `EvaluationRun` document
   (`server/src/models/EvaluationRun.js`).

## Metrics

The `EvaluationRun` aggregate computed by `batchEvaluator.js` (`aggregateMetrics()`):

| Metric | Definition |
|---|---|
| `totalCases` | cases processed in the run |
| `totalRevenueAtRisk` | sum of `amount` across all cases |
| `eligibleRevenue` | sum of `amount` for cases that passed the Eligibility Engine |
| `actionsExecuted` | count of executed non-`STOP` actions |
| `recoveredRevenue` | sum of `recoveredAmount` over `RECOVERED` cases — **always the sum of actual per-case simulated outcomes, never fabricated** |
| `recoveryRate` | `recoveredRevenue / eligibleRevenue` |
| `escalatedRevenue` / `stoppedRevenue` | sum of `amount` for `ESCALATED` / `STOPPED` cases |
| `recoveredCases` / `escalatedCases` / `stoppedCases` | counts |
| `policyViolations` | cases where an executed action had no corresponding `POLICY_APPROVED` — target 0; surfaced, not hidden |
| `recoveryByIntervention` | per intervention (`CREATE_PAYMENT_LINK`, `START_VOICE_RECOVERY`, `ESCALATE`, `STOP`): `count, revenue, recoveredRevenue, recoveryRate` |
| `archetypeBreakdown` | per synthetic archetype: `count, revenue, recoveredRevenue, recoveredCases, escalatedCases, stoppedCases, recoveryRate` |

## Honesty separation

Synthetic evaluation numbers and real Razorpay Test Mode activity are kept apart:

- The Evaluation page is labelled as a synthetic batch run and carries an "About this run" note
  describing what is simplified relative to this spec.
- The single-case Razorpay flow is a distinct `LIVE_TEST_MODE` `RecoveryAction`, shown on the
  case detail / audit trail as a real Test Mode action.
- The evaluator writes **nothing** to `recovery_cases` / `audit_logs`, so there is no live/synthetic
  commingling to filter — the separation is structural, not a `source` tag.

## Reproducibility

Given the same seed, the same `count`, and the same pipeline code, a run is bit-for-bit
reproducible — the basis for regression-checking the decision logic itself (e.g. "did changing
the scoring weights change the recovery rate on the same seed?").
