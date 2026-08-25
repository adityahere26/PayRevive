# evaluation/

Seeded synthetic dataset generator (`datasetGenerator.js`) plus a batch evaluator
(`batchEvaluator.js`) that runs the real recovery pipeline (`server/src/pipeline`) against
that dataset with the same simulated (seeded-RNG) executor every non-live single-case caller
already uses — never real Gemini, Razorpay, or voice calls (`EVALUATION.md` § Batch evaluation
engine).

Cases are generated and evaluated in memory per request — they are not written to the live
`recovery_cases`/`audit_logs` collections, so an evaluation run can never leak into the
merchant's live dashboard metrics. Only the aggregate result is persisted, as an
`EvaluationRun` document (`server/src/models/EvaluationRun.js`, schema unchanged).

Wired up via `POST /api/evaluation/run` (`server/src/routes/evaluation.js`), per
`ARCHITECTURE.md`'s documented API contract.

This is a minimal, MVP-scale implementation of `EVALUATION.md`'s spec (dozens–hundreds of
cases per run, not the full 500–1000 case dataset with hidden ground-truth
`trueRecoverable`/`interventionEffectiveness` fields) — see the Evaluation page's own "About
this run" note for what's simplified relative to the full spec.
