# CLAUDE.md — Working Agreement for This Repository

This file orients any Claude Code session (or human contributor) working in `payrevive`.
Read this first, then `SPEC.md` for what we're building, then `ARCHITECTURE.md` for how.

## Project identity

- **Name:** payrevive
- **Track:** Razorpay AI Buildathon — Track 03: AI Revenue Recovery
- **One line:** An AI revenue recovery agent that detects revenue at risk, diagnoses the cause,
  selects a bounded intervention, checks it against deterministic merchant policy, executes it,
  and measures what was actually recovered.
- **Current phase:** SUBMISSION / final build. The product is implemented, tested
  (`npm test` — 317 tests across 30 files at HEAD), and deployed: frontend on Vercel
  (`https://payrevive.xyz`, custom domain), backend on Render, database on MongoDB Atlas,
  `NODE_ENV=production`. `/client`, `/server`, `/evaluation`, and `/tests` are all built and
  populated. The engineering constraints and core principles below still govern any further
  change.

## AI provider — read this before touching anything AI-related

Two different things are both called "AI" in this project. Do not conflate them:

- **Claude Code** is the development/coding assistant used to *build* payrevive — it writes code,
  writes these docs, runs tests. It is tooling for us, the developers, and has no role at runtime.
- **Google Gemini is payrevive's runtime AI provider.** In the shipped build the one live Gemini
  call is **Hinglish/Devanagari voice-intent classification** (`server/src/ai/gemini/voiceClassifier.js`),
  via the official `@google/genai` SDK, authenticated via `GEMINI_API_KEY`, model
  `GEMINI_MODEL || "gemini-2.5-flash"`. The recovery Decision/Planner module
  (`server/src/ai/gemini/planner.js`) is implemented and tested but not wired to a route;
  decision-factor explanation text is generated deterministically (`pipeline/decisionRationale.js`),
  not by Gemini. When Gemini is unavailable, voice classification falls back to a bounded
  deterministic keyword classifier (`pipeline/deterministicVoiceIntent.js`). No other AI provider
  is used at runtime. (Migrated from OpenAI; see `git log` for the migration commit — no OpenAI
  code, dependency, or env var remains.)
- This file is named `CLAUDE.md` by the coding assistant's own naming convention — that says
  nothing about the product's runtime AI provider. Never describe Claude as payrevive's runtime AI
  in code, docs, the README, or the demo video.

## Document map

| Doc | Purpose |
|---|---|
| `SPEC.md` | Product definition, MVP scope, P0/P1/P2 feature list, non-goals |
| `ARCHITECTURE.md` | System design, folder structure, DB schema, API contract, state machine, deployment |
| `AGENT_DESIGN.md` | The 10-module agent pipeline, AI output contract, tools, prompt-injection defenses |
| `RECOVERY_POLICY.md` | Policy engine rules, recovery scoring formula, intervention selection, escalation |
| `EVALUATION.md` | Synthetic dataset design, batch evaluator, metrics, simulated outcome engine |
| `SECURITY.md` | Threat model, authn/authz, rate limits, webhook security, logging rules |

These six docs are the source of truth. If code and docs disagree, treat it as a bug in one of
them and reconcile — don't silently pick one.

## Non-negotiable engineering constraints

These were set explicitly for this build and should not be relitigated mid-project:

- **No TypeScript.** Plain JS (JSX for React).
- **No Prisma, no PostgreSQL.** MongoDB via Mongoose only.
- **No microservices, no Kubernetes, no message queues** unless a specific requirement proves
  otherwise (it hasn't yet).
- **No LLM tool-calling/agentic framework** (LangChain, AutoGPT-style loops, etc.) for the core
  recovery pipeline. See `AGENT_DESIGN.md` § Agent architecture for the actual conceptual model —
  the pipeline is deterministic orchestration that calls plain service functions; Gemini's only
  wired-live role is Hinglish/Devanagari voice-intent classification, and its output is always
  validated and re-checked by deterministic policy code before anything executes.
- Simplest architecture that correctly demonstrates the product wins over impressive-looking
  complexity. This is a 7-day build for a judged submission, not a production fintech platform.

## Core engineering principles

1. **Money, policy, thresholds, retry counts, eligibility, state transitions, audit records, and
   metrics are controlled by deterministic code — never by LLM output.**
2. **The AI never bypasses the policy engine.** Any AI-recommended action is advisory until the
   policy engine approves it.
3. **Never trust client input for amount, customerId, merchantId, caseId, or action.** These are
   always re-derived server-side from the authenticated session and the stored recovery case.
4. **Every state-changing event writes an audit log entry.** If it's not audited, it didn't
   happen, as far as the product is concerned.
5. **Customer input (voice transcripts, chat text) is data, not instructions.** It can never
   change policy, thresholds, or permissions — see `AGENT_DESIGN.md` § Prompt Injection Defense.
6. **Every simulated/synthetic result must be labeled as such in the UI and API.** Never let
   evaluation-batch numbers be presented as real Razorpay Test Mode activity, or vice versa.

## Tech stack (fixed for this build)

- **Backend:** Node.js 20+, Express 4, Mongoose (MongoDB / MongoDB Atlas).
- **Frontend:** React 18 + Vite, plain JS/JSX, hand-written CSS (no heavy component library —
  the dashboard must look like a restrained fintech ops tool, not a generic SaaS template).
- **Auth:** JWT-based sessions. Only the demo path is implemented — `POST /api/auth/demo` mints a
  2h token for a pre-seeded demo merchant so evaluators never register; there is no live
  `/login` or `/register`. `GET /api/auth/me` is the session-validation endpoint the demo-entry
  flow uses to detect and replace a stale token.
- **AI (runtime):** Google Gemini via `@google/genai`, structured output only
  (`responseSchema`/`responseMimeType: application/json`) validated server-side with ajv. See
  § AI provider above for the one authoritative description (one live call: voice-intent
  classification; planner unwired; deterministic fallback; Claude Code is dev tooling only).
- **Validation:** ajv for both API request validation and AI output contract validation.
- **Rate limiting:** `express-rate-limit` on sensitive routes.
- **Security headers:** `helmet`.
- **Testing:** Node's built-in `node:test` + `assert` — no extra test framework dependency.
- **Deterministic randomness:** a small hand-rolled seeded PRNG (mulberry32) for synthetic data
  generation and simulated recovery outcomes — no external dependency, fully reproducible.
- **Deployment:** frontend → Vercel, backend → Render, database → MongoDB Atlas.

## Commit convention

Conventional-commit style, one logical change per commit, matching the categories already used
in planning: `feat:`, `fix:`, `test:`, `docs:`. Do not fabricate history — commits should reflect
work actually done in this session/branch.

## Definition of done for a feature

A feature is not done until:
- It has a deterministic, testable core (business logic isolated from HTTP/AI plumbing).
- It writes the audit events specified for it in `AGENT_DESIGN.md`.
- It respects merchant-level data isolation (every query scoped by `merchantId`).
- It has at least one test for the "happy path" and one for the relevant stopping/blocking rule.
- Any doc it changes the behavior of (`ARCHITECTURE.md`, `RECOVERY_POLICY.md`, etc.) is updated
  in the same change.
