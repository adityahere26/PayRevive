# evaluation/

Not implemented yet. Per the 7-day plan (`ARCHITECTURE.md`, `EVALUATION.md`), this is built on
Day 6: a seeded synthetic dataset generator (500–1000 cases) plus a batch evaluator that runs
the real recovery pipeline (`server/src/pipeline`, once it exists) against that dataset with
simulated executors — never real OpenAI, Razorpay, or voice calls (`EVALUATION.md` § Batch
evaluation engine).

This directory exists now only to match the repository structure in `ARCHITECTURE.md`.
