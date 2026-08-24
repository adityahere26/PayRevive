# EVALUATION.md — Synthetic Dataset and Batch Evaluation

## Purpose

Batch evaluation is the primary evidence of the system working "across a batch," as the track
requires. It must run the **actual production decision pipeline** (`/server/src/pipeline`) against
a large, deterministic, synthetic dataset, and report honestly measured outcomes — never a
hand-picked or fabricated number. **Batch evaluation never calls the Gemini API, never calls
Razorpay, never starts a real voice session, and never executes any real external recovery
action** — see § Batch evaluation engine for how every external call is substituted with a
deterministic, seeded simulation.

This separation is deliberate and load-bearing: the deterministic pipeline (Risk Detector →
Root Cause Analyzer → Eligibility Engine → Scoring Engine → Intervention Selector → Policy
Engine → Action Executor) must be fully testable — in both the automated test suite and a batch
evaluation run — **without a live `GEMINI_API_KEY`**. The AI Decision/Planner
(`server/src/ai/`, see `AGENT_DESIGN.md` § Provider abstraction) is a separate, independently
testable module; its failure modes (timeout, malformed output, missing key) are handled by its
own fail-safe fallback and are never a precondition for the deterministic guardrails' own tests
to pass. A batch run only exercises the live AI planner if a future evaluation mode explicitly
opts into testing it — the default run never requires or calls it.

## Synthetic dataset

- **Size:** 500 cases minimum, 1000 preferred if performance holds.
- **Determinism:** generated from a seed using a hand-rolled seeded PRNG (mulberry32 or
  equivalent, no external dependency) — same seed always produces the same dataset, so evaluation
  runs are reproducible and diffable across code changes.
- **No real customer data** — all names, amounts, and identifiers are synthetic, drawn from
  realistic Indian merchant/customer patterns (see `SPEC.md` / demo data notes) but generated, not
  sourced.

Case archetypes the generator must produce (proportions tunable, all represented):
- Payment failures — retryable and non-retryable
- Checkout abandonment
- Repeat customers vs. first-time customers
- High-value vs. low-value payments
- Customers with prior recovery successes and prior recovery failures
- Opted-out customers
- Cases that should resolve to Promise-to-Pay
- Cases that should resolve to Escalation (amount above threshold)
- Cases that should resolve to Stop (refusal / non-retryable / window expired)
- Ambiguous cases (deliberately noisy signals, to exercise `UNKNOWN` root cause and mid-band
  scores)

Each generated case carries **hidden ground-truth fields** used only by the simulated outcome
engine, never by the pipeline under test: `trueRecoverable (bool)` and
`interventionEffectiveness` (0–1, per possible intervention type). These are assigned from the
same archetype logic used to construct the case's visible fields, so the simulation isn't
circular — the pipeline doesn't get to see or influence them.

## Batch evaluation engine

`POST /api/evaluation/run` (rate-limited): generates (or loads, if seed matches a prior run) the
dataset, then for each case:

1. Runs it through the real pipeline: Risk Detector → Root Cause Analyzer → Eligibility Engine →
   Scoring Engine → Intervention Selector → Policy Engine → Action Executor.
2. The Action Executor, in evaluation mode, substitutes a **simulated executor** for every action
   that would otherwise reach a live external service — Razorpay Payment Link creation, a real
   browser voice session, or a **Gemini API call for voice intent classification**. This holds
   even for cases whose selected intervention is `START_VOICE_RECOVERY`: the simulated executor
   resolves the hypothetical voice outcome using the case's `interventionEffectiveness` and the
   seeded PRNG, the same way it resolves a Payment Link outcome — it never classifies a real
   transcript or calls Gemini. Concretely: `rng() < interventionEffectiveness → recovered`. This
   keeps outcomes realistic (not every correctly-selected case "succeeds") while remaining fully
   reproducible for a given seed and free of external cost, latency, or rate-limit exposure.
3. Every case still writes real `recovery_cases`, `recovery_actions`, and `audit_logs` documents,
   tagged with the `evaluation_runs._id` they belong to, so a run can be inspected case-by-case
   exactly like a live case.
4. Aggregates are computed and stored on the `evaluation_runs` document.

## Metrics

| Metric | Definition |
|---|---|
| `totalCases` | cases processed in the run |
| `totalRevenueAtRisk` | sum of `amount` across all cases |
| `eligibleRevenue` | sum of `amount` for cases that passed the Eligibility Engine |
| `actionsExecuted` | count of non-`STOP` actions actually executed |
| `recoveryAttempts` | sum of attempts across all cases |
| `recoveredRevenue` | sum of `recoveredAmount` where the simulated outcome was success — **the headline number, never fabricated, always the sum of actual per-case simulated outcomes** |
| `recoveryRate` | `recoveredRevenue / eligibleRevenue` |
| `escalatedRevenue` | sum of `amount` for `ESCALATED` cases |
| `stoppedRevenue` | sum of `amount` for `STOPPED` cases |
| `policyViolations` | count of any case where an executed action did not have a corresponding `POLICY_APPROVED` audit event — target is always 0; if non-zero, it is surfaced, not hidden |
| `averageAttempts` | mean `attempts` across all cases |
| `recoveryByIntervention` | per intervention type (Payment Link, Voice Recovery, Promise-to-Pay, Retry, Escalation): case count, revenue, recovery rate |

Policy-specific metrics also reported: autonomous actions allowed, actions blocked by policy,
escalations, stopped actions, policy violations (same field as above, surfaced in both the
evaluation summary and the dashboard's policy section).

## Honesty separation

The UI and API must never let synthetic evaluation numbers be mistaken for real Razorpay Test
Mode activity, or vice versa:

- Evaluation views are labeled **"Evaluation Batch — Synthetic Data."**
- The live single-case Razorpay flow is labeled **"Razorpay Test Mode — Live Integration."**
- `evaluation_runs` documents and any case created by a run are tagged (`source: EVALUATION`) so
  dashboard aggregates can filter live vs. simulated data explicitly rather than commingling them
  by default.

## Reproducibility

Given the same seed and the same pipeline code, a run is bit-for-bit reproducible — this is the
basis for regression-checking the decision logic itself (e.g. "did changing the scoring weights
change the recovery rate on the same 1000 cases?").
