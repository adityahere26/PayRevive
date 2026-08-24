
# ARCHITECTURE.md — System Design

## System overview

```
                         ┌─────────────────────────────────────────┐
                         │              CLIENT (React/Vite)          │
                         │  Dashboard · Recovery Case · Voice Page   │
                         │  Merchant Policy Page · Evaluation View   │
                         └───────────────────┬───────────────────────┘
                                              │ HTTPS (JWT bearer)
                         ┌───────────────────▼───────────────────────┐
                         │             SERVER (Node/Express)          │
                         │                                            │
                         │  Auth ─ Rate limit ─ CORS ─ Validation      │
                         │                                            │
                         │  ┌──────────────────────────────────────┐  │
                         │  │        Recovery Pipeline (10 modules) │  │
                         │  │  Risk Detector → Root Cause Analyzer   │  │
                         │  │  → Eligibility Engine → Scoring Engine │  │
                         │  │  → Intervention Selector → Policy      │  │
                         │  │    Engine → Action Executor →          │  │
                         │  │    Outcome Evaluator → Audit Logger    │  │
                         │  │  (Voice Intent Classifier feeds the    │  │
                         │  │   Intervention Selector during voice   │  │
                         │  │   sessions only)                       │  │
                         │  └──────────────────────────────────────┘  │
                         │                                            │
                         │  Razorpay Client (Test Mode) ── Webhook     │
                         │  Handler ── Gemini API Client (AI Planner)  │
                         └──────┬─────────────────────────┬───────────┘
                                │                          │
                     ┌──────────▼─────────┐     ┌──────────▼──────────┐
                     │   MongoDB Atlas      │     │  Razorpay Test Mode  │
                     │  (all collections)   │     │  Payment Links API   │
                     └──────────────────────┘     └──────────────────────┘
```

The recovery pipeline is **deterministic orchestration**: plain function calls in sequence, each
a separate module with a narrow contract. The only module that calls an external AI model is the
Voice Intent Classifier, via the **Gemini API** (payrevive's sole runtime AI provider, via the
official `@google/genai` SDK — Claude Code is a development-time tool only, see `CLAUDE.md` § AI
provider), and only during an active voice session; its output is a validated, schema-constrained
recommendation that still passes through the Policy Engine like any other candidate action. See
`AGENT_DESIGN.md` § Agent architecture for the full conceptual model (AI Decision/Planner →
policy/guardrail engine → allowlisted action → executor → observation), § Provider abstraction
for the `AIProvider` → `GeminiProvider` code boundary (`server/src/ai/`), and the rationale for
why this is not built as a live LLM tool-calling loop.

## Folder structure (planned — not yet created)

```
/client                    React frontend (Vite, plain JS/JSX)
  /src
    /pages                 Dashboard, RecoveryCaseDetail, VoiceRecovery, MerchantPolicy, Evaluation
    /components
    /api                   fetch wrappers, one per resource
    /state                 minimal client state (auth token, demo mode flag)

/server                     Express backend
  /src
    /models                 Mongoose schemas (one file per collection)
    /pipeline                the 10 deterministic modules from AGENT_DESIGN.md
    /policy                  policy engine + policy defaults
    /razorpay                Razorpay client wrapper (payment links, webhook verify)
    /ai                      provider.js (AIProvider boundary) + schema.js (AI output schema +
                              validator) + /gemini (client.js — the only file importing
                              @google/genai — and planner.js) — see AGENT_DESIGN.md §
                              Provider abstraction
    /routes                  Express routers, grouped by resource
    /middleware              auth, merchant-scoping, rate limit, error handler
    /audit                   audit logger
    /lib                     seeded PRNG, shared utils

/evaluation                  synthetic dataset generator + batch evaluator (imports /server/src/pipeline
                              directly so evaluation runs the exact same decision code as production)

/tests                       node:test suites, mirroring /server/src structure

/docs                        supplementary diagrams (added as needed; root-level docs remain the
                              source of truth)

Root: README.md CLAUDE.md SPEC.md ARCHITECTURE.md AGENT_DESIGN.md RECOVERY_POLICY.md
      EVALUATION.md SECURITY.md TESTING.md DEMO_SCRIPT.md .env.example
```

`TESTING.md`, `DEMO_SCRIPT.md`, and `README.md` are written later (Day 6/7 per the execution
plan) once there is real implementation and real results to describe honestly — they are not
part of this planning pass.

## Database schema (MongoDB / Mongoose)

All collections carry `merchantId` (except `webhook_events`, which is platform-level) and every
query against merchant-owned data is scoped by it — see `SECURITY.md` § Authorization.

**merchants**
`_id, name, email (unique), passwordHash, policy { maxRecoveryAttempts, maxVoiceAttempts,
maxAutonomousAmount, recoveryWindowHours, escalationAmount, optOutBehavior, maxContactAttempts },
isDemo, createdAt`

**customers**
`_id, merchantId, name, email, phone, optedOut, createdAt`
Indexes: `merchantId`, `{merchantId, optedOut}`

**payments**
`_id, merchantId, customerId, amount, currency, status (created|failed|paid), failureReason,
razorpayPaymentId, createdAt`
Indexes: `merchantId`, `customerId`, `status`

**checkout_sessions**
`_id, merchantId, customerId, amount, currency, status (started|abandoned|completed), createdAt`
Indexes: `merchantId`, `customerId`, `status`

**recovery_cases**
`_id, merchantId, customerId, sourceType (PAYMENT_FAILURE|CHECKOUT_ABANDONMENT), paymentId,
checkoutSessionId, amount, currency, status (state machine, below), rootCause, recoveryProbability,
reasonCodes[], selectedIntervention, policyDecision, attempts, voiceAttempts, recoveredAmount,
recoveryWindowExpiresAt, createdAt, updatedAt`
Indexes: `merchantId`, `customerId`, `status`, `createdAt`

**recovery_actions**
`_id, caseId, merchantId, actionType (CREATE_PAYMENT_LINK|START_VOICE_RECOVERY|
RECORD_PROMISE_TO_PAY|ESCALATE|STOP), status, result, metadata, createdAt`
Indexes: `caseId`, `merchantId`

**recovery_attempts**
`_id, caseId, merchantId, attemptNumber, channel (PAYMENT_LINK|VOICE|RETRY), outcome, createdAt`
Indexes: `caseId`

**promise_to_pay**
`_id, recoveryCaseId, customerId, merchantId, amount, promisedDate, createdAt, status
(PENDING|FULFILLED|BROKEN), source (VOICE|MANUAL), conversationRef`
Indexes: `recoveryCaseId`, `merchantId`

**webhook_events**
`_id, eventId (unique), eventType, receivedAt, processedAt, status
(RECEIVED|PROCESSED|ALREADY_PROCESSED|FAILED), payloadHash, processingError`
Indexes: `eventId` (unique, enforces idempotency at the DB layer)

**audit_logs**
`_id, timestamp, caseId, merchantId, actor (SYSTEM|AI|MERCHANT|CUSTOMER), eventType, reason,
metadata, result`
Indexes: `caseId`, `merchantId`, `createdAt`

**evaluation_runs**
`_id, merchantId (or platform-level demo merchant), seed, totalCases, metrics {...per
EVALUATION.md}, createdAt`
Individual case-level results from a run are capped/sampled in the stored document (not all 1000
inlined) to keep documents within MongoDB's size limits; full per-case results are computed
in-memory during the run and only aggregates plus a bounded sample are persisted.

## Payment state machine

```
Entry states:      PAYMENT_FAILED     (Scenario A)
                    CHECKOUT_ABANDONED (Scenario B)

PAYMENT_FAILED / CHECKOUT_ABANDONED
        │
        ▼
  RISK_DETECTED
        │
        ▼
   ANALYZING     root cause (module 2) + Eligibility Engine (module 3), which evaluates
        │        steps 1–4 of the shared precedence function — RECOVERY_POLICY.md §
        │        Policy precedence: OPT_OUT → HIGH_VALUE_AMOUNT_CHECK → RECOVERY_WINDOW
        │        → ATTEMPT_LIMIT
        │
        ├──► STOPPED    (opt-out, explicit refusal, or attempt limit reached)
        ├──► ESCALATED  (amount > MAX_AUTONOMOUS_AMOUNT — checked BEFORE window/attempts,
        │                so a high-value case can never be silently resolved as EXPIRED
        │                or STOPPED instead)
        ├──► EXPIRED    (recovery window has passed)
        ▼
    ELIGIBLE
        │
        ▼
 ACTION_SELECTED       (Intervention Selector, module 5 — scoring already ran, module 4)
        │
        ▼
POLICY_APPROVED        (Policy Engine, module 6 — re-runs the SAME shared precedence
        │                function, steps 1–5, as the final authoritative gate)
        ├──► blocked/escalated/stopped ──► ESCALATED | STOPPED
        ▼
 ACTION_EXECUTED        (Action Executor, module 7)
        │
        ▼
WAITING_OUTCOME
        │
   ┌────┴──────┐
   ▼           ▼
RECOVERED    FAILED
```

**Retry behavior:** `FAILED` is not terminal. Its only valid transition is back into `ANALYZING`
— never directly into `ACTION_SELECTED`. This guarantees the Eligibility Engine and, further
downstream, the Policy Engine both re-run against the freshly-incremented attempt count before
any further action executes; a case cannot retry its way past an attempt limit or a high-value
threshold by skipping the re-check.

Terminal states: `RECOVERED, STOPPED, ESCALATED, EXPIRED`. Transitions are validated by a single
`transition(case, toStatus)` function in `/server/src/pipeline` — any transition not in the table
above throws and is rejected, so an invalid state change can never silently occur.

## API contract

All routes except `/api/auth/*` and `/api/webhooks/razorpay` require a JWT bearer token, and every
resource route re-verifies `resource.merchantId === req.merchant.id` before returning data.

| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/login` | rate-limited |
| POST | `/api/auth/register` | rate-limited; disabled or restricted in demo deployment if needed |
| POST | `/api/auth/demo` | rate-limited; issues a short-lived (2h), scoped token for the pre-seeded demo merchant, no credentials needed — see `SECURITY.md` § Demo authentication |
| GET | `/api/dashboard/summary` | primary + secondary metrics for the authenticated merchant |
| GET | `/api/recovery-cases` | paginated, filterable by status/sourceType |
| GET | `/api/recovery-cases/:id` | 404 if not found OR not owned by merchant (never distinguish the two) |
| POST | `/api/recovery-cases/:id/analyze` | runs root cause + eligibility + scoring, advances state |
| POST | `/api/recovery-cases/:id/execute` | runs intervention selection + policy check + execution |
| POST | `/api/recovery-cases/:id/payment-link` | rate-limited; full validation chain, see § Razorpay integration |
| POST | `/api/recovery-cases/:id/promise-to-pay` | records a promise (from voice or manual entry) |
| POST | `/api/recovery-cases/:id/escalate` | forces `ESCALATED`, writes audit event |
| POST | `/api/recovery-cases/:id/stop` | forces `STOPPED`, writes audit event |
| POST | `/api/recovery-cases/:id/voice-intent` | rate-limited; body: `{transcript}`; see `AGENT_DESIGN.md` |
| GET | `/api/recovery-cases/:id/audit` | full audit trail for the case |
| POST | `/api/checkout-sessions/:id/simulate-abandonment` | demo trigger, rate-limited; invokes the exact same Revenue Risk Detector pipeline as real timeout-based detection — see § Checkout abandonment detection |
| POST | `/api/evaluation/run` | rate-limited, likely admin/demo-only given cost/time |
| GET | `/api/evaluation/:id` | evaluation run results |
| GET | `/api/merchant/policy` / `PUT /api/merchant/policy` | read/update merchant policy config |
| POST | `/api/webhooks/razorpay` | no auth (signature-verified instead); raw body required |

Error responses are uniform:
```json
{ "error": { "code": "RECOVERY_POLICY_BLOCKED", "message": "...", "requestId": "..." } }
```
No stack traces in any environment-facing response; stack traces are logged server-side only,
keyed by `requestId`.

## Checkout abandonment detection

Two triggers, one pipeline. There is no separate code path for "real" vs. "demo" abandonment —
only two different ways of invoking the same Revenue Risk Detector (module 1):

1. **Real mechanism:** a `checkout_session` is created in `started` status when checkout begins.
   A lightweight periodic in-process check (an interval, not a queue — consistent with
   `CLAUDE.md` § non-negotiable constraints) scans for sessions still `started` past a
   merchant-configurable `CHECKOUT_ABANDONMENT_TIMEOUT_MINUTES` (sensible default ~30 minutes)
   with no corresponding successful payment, marks them `abandoned`, and invokes the Revenue Risk
   Detector exactly as a `payment.failed` event does for Scenario A.
2. **Demo trigger:** `POST /api/checkout-sessions/:id/simulate-abandonment` marks the session
   `abandoned` immediately and calls the identical Revenue Risk Detector function — it does not
   fabricate a `recovery_case` directly or take any shortcut around the pipeline. This exists so a
   live demo or evaluator isn't forced to wait out a real timeout window; the resulting case,
   audit trail, and downstream behavior are indistinguishable from the real path.

## Razorpay integration plan

- **Mode:** Test Mode only, everywhere. Keys read from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`,
  used only server-side.
- **Primary API:** Standard Payment Links (`POST /v1/payment_links` per Razorpay's documented
  Payment Links API), created from the backend after the full validation chain in
  `RECOVERY_POLICY.md` § Payment Link Safety passes. The recovery case's own `_id` is passed in
  the link's `reference_id`/`notes` so the webhook can map an incoming event back to a case
  without trusting any client-supplied identifier.
- **Webhook:** `POST /api/webhooks/razorpay`, configured in the Razorpay Dashboard (Test Mode)
  against `payment_link.paid` (and/or `payment.captured`) events. Verified using the raw request
  body and `RAZORPAY_WEBHOOK_SECRET` per Razorpay's documented HMAC signature scheme. **Exact
  header name and event/payload field names (signature header, event id field) will be confirmed
  against Razorpay's current official webhook documentation at implementation time (Day 4) rather
  than assumed here** — this doc will be updated once verified, per the "don't invent undocumented
  contracts" rule.
- **Idempotency:** every inbound webhook is first written to `webhook_events` keyed by a unique
  `eventId`; a duplicate insert (unique index violation) short-circuits to `ALREADY_PROCESSED`
  before any state-changing logic runs. Recovered-revenue accounting only ever happens on the
  first successful processing of a given `eventId`.
- **Orders API:** not used unless Payment Links prove insufficient for the demo flow; no plan to
  add it speculatively.

## Deployment topology

- **Frontend:** Vercel (static Vite build).
- **Backend:** Render (or Railway/Fly — Render assumed as default), Node process, env vars
  configured in the platform, not committed.
- **Database:** MongoDB Atlas (free/shared tier sufficient for this scale).
- HTTPS everywhere; CORS locked to `FRONTEND_URL`. See `SECURITY.md` for full detail.
- Target: smallest possible end-to-end slice deployed early (Day 2–3), then iterated in place —
  never a big-bang deploy on the last day.

## Key architecture decisions and rationale

- **Runtime AI provider is Google Gemini, exclusively**, via the official `@google/genai` SDK.
  Claude Code is a development-time tool only. Every runtime AI call (the recovery
  Decision/Planner, Voice Intent Classifier, optional explanation text) goes through the Gemini
  API, and business logic depends on the `AIProvider` interface (`server/src/ai/provider.js`),
  never on Gemini SDK objects directly — see `CLAUDE.md` § AI provider and `AGENT_DESIGN.md` §
  Provider abstraction.
- **No LLM tool-calling framework.** The "tools" named in the brief (`getRecoveryCase`,
  `createPaymentLink`, etc.) are implemented as plain backend service functions called by
  deterministic pipeline code, not as functions exposed to a live function-calling loop for the
  main pipeline. This removes an entire class of risk (non-deterministic control flow deciding
  when to move money) without losing any required capability, and is far more reliable to build,
  test, and demo in 7 days. The actual agentic shape — AI Decision/Planner → structured decision →
  policy/guardrail engine → allowlisted action → executor → observation — is set out in
  `AGENT_DESIGN.md` § Agent architecture.
- **Policy precedence is one shared, ordered function**, not duplicated logic in the Eligibility
  Engine and the Policy Engine. Both stages evaluate the same steps — `OPT_OUT →
  HIGH_VALUE_AMOUNT_CHECK → RECOVERY_WINDOW → ATTEMPT_LIMIT → other rules` — so a high-value case
  can never be silently resolved as `EXPIRED`/`STOPPED` by one stage while the other would have
  escalated it. See `RECOVERY_POLICY.md` § Policy precedence.
- **A retry never skips back into `ACTION_SELECTED`.** `FAILED` always re-enters `ANALYZING`, so
  eligibility and policy are both re-evaluated against the incremented attempt count before any
  further action executes.
- **Scoring is a weighted deterministic formula, not an LLM opinion.** See `RECOVERY_POLICY.md`.
  This is what makes the recovery probability explainable and auditable rather than a black box.
- **Voice responses are templated, not freely generated**, keyed by classified intent + case
  data, so the agent can never improvise a commitment the system can't back (e.g. promising a
  discount, misquoting an amount).
- **Evaluation reuses production pipeline code**, not a separate re-implementation, and never
  calls the real Gemini API or real Razorpay/voice services — see `EVALUATION.md` § Batch
  evaluation engine.
- **Checkout abandonment detection and its demo trigger share one code path** — see § Checkout
  abandonment detection above.
