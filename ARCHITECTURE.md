
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
recoveryWindowExpiresAt, razorpayPaymentLinkId, razorpayPaymentLinkShortUrl, razorpayLinkClaimedAt,
createdAt, updatedAt`
Indexes: `merchantId`, `customerId`, `status`, `createdAt`

The three `razorpay*` fields are Day 6 additions, safe identifiers only (never a credential) — see
§ Razorpay integration (Test Mode). `razorpayPaymentLinkId` doubles as the Payment Link safety
checklist's idempotency check (`RECOVERY_POLICY.md`): once set, a retry/double-click reuses the
existing link instead of creating a second one. `razorpayLinkClaimedAt` backs the atomic,
self-healing creation claim described in the same section — it is not meaningful once a link
exists and is cleared on both success and failure.

**recovery_actions**
`_id, caseId, merchantId, actionType (CREATE_PAYMENT_LINK|START_VOICE_RECOVERY|
RECORD_PROMISE_TO_PAY|ESCALATE|STOP), status, result, metadata, createdAt`
Indexes: `caseId`, `merchantId`

`status` is an unconstrained string, not an enum — in practice it is `SIMULATED` for the
Razorpay-free simulated executor path (evaluation, `/simulate-action`, voice when Razorpay isn't
configured) or `LIVE_TEST_MODE` for a real Razorpay Test Mode action (§ Razorpay integration),
keeping the two paths distinguishable in the dashboard and audit trail per `EVALUATION.md`'s
honesty-separation requirement.

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

## Razorpay integration plan (implemented, Day 6)

Built and tested (mocked Razorpay boundary — no real network call in any automated test). Two
recovery paths coexist, deliberately kept distinct so the dashboard and audit trail never conflate
them (`EVALUATION.md` § Honesty separation, applied here to live vs. simulated single-case
recovery, not just batch evaluation):

- **Simulated recovery** — `POST /:id/simulate-action` (unchanged since Day 3) and the batch
  evaluator. Never calls Razorpay; resolves an outcome via the seeded PRNG against the case's own
  `recoveryProbability`. `recovery_actions.status` is `SIMULATED`.
- **Razorpay Test Mode recovery** — `POST /:id/payment-link` and the voice turn handler when
  `selectedIntervention === CREATE_PAYMENT_LINK` and Razorpay is configured. Makes a real Razorpay
  **Test Mode** API call. `recovery_actions.status` is `LIVE_TEST_MODE`. **Real/live Razorpay
  payments are out of scope for this build** — see § Test Mode enforcement below; no code path in
  this system can reach Razorpay Live Mode.

Both paths execute through the same Action Executor (`pipeline/actionExecutor.js`) and, for the
live path specifically, the same shared function (`pipeline/tools.js`'s `createLivePaymentLink`)
— `routes/recoveryCases.js`'s `POST /:id/payment-link` and `routes/voice.js`'s voice-turn handler
both call it, so there is exactly one Razorpay-executing code path, never a voice-specific one.

- **Mode:** Test Mode only, everywhere. Keys read from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`,
  used only server-side (`server/src/integrations/razorpay/client.js`, the only file that reads
  them to make a request — mirrors the `ai/gemini/client.js` "one file imports the credential"
  pattern). Never sent to the frontend, to Gemini, or logged.
- **Test Mode enforcement:** `config/env.js` refuses to start if a configured `RAZORPAY_KEY_ID`
  does not begin with `rzp_test_` — Razorpay's own documented Test/Live key prefix convention.
  A live-shaped key is a hard startup failure, not a warning, making it structurally difficult to
  point this build at Live Mode by accident.
- **Direct HTTPS, no SDK:** `integrations/razorpay/` calls the REST API directly (Node's built-in
  `fetch`, Basic Auth) rather than depending on the `razorpay` npm package — the Payment Links API
  is a single authenticated POST, and this also lets webhook signature comparison use
  `crypto.timingSafeEqual` rather than the SDK's own non-constant-time comparison.
- **API:** `POST /api/recovery-cases/:id/payment-link` (rate-limited, `requireMerchantOwnership`)
  runs the Payment Link safety checklist (`RECOVERY_POLICY.md` § Payment Link safety checklist),
  then calls Razorpay's Standard Payment Links API (`POST /v1/payment_links`, verified against
  Razorpay's official docs). The amount sent is always the case's own stored `amount` in rupees,
  converted to paise (`amount * 100`) — Razorpay's smallest-currency-unit convention — never a
  client-supplied value. `accept_partial` is always `false`, which structurally rules out
  Razorpay's `payment_link.partially_paid` event for any link this system creates. The recovery
  case's own `_id` is passed as the link's `reference_id` (and again in `notes`) so the webhook can
  map an incoming event back to a case without trusting any client-supplied identifier.
- **Idempotent creation (atomic claim, self-healing):** creating a payment link is guarded by a
  single atomic Mongo `findOneAndUpdate` (`pipeline/tools.js`'s `claimPaymentLinkCreation`) — never
  a read-then-write — that only matches a case which is `POLICY_APPROVED` for
  `CREATE_PAYMENT_LINK`, has no link yet, and is not currently claimed by another in-flight
  request. The claim (`razorpayLinkClaimedAt`) expires after **30 seconds**: a request that dies
  mid-flight (crash, timeout) leaves the case automatically reclaimable rather than permanently
  locked, with no separate "creating" state needed in the state machine. If the Razorpay call
  itself fails, the claim is released immediately and the case stays `POLICY_APPROVED`, retryable.
  If a link already exists for the case (`razorpayPaymentLinkId` set), the route returns that
  existing link instead of calling Razorpay again — a retry, double-click, or page refresh can
  never create a second link for the same case.
- **Webhook:** `POST /api/webhooks/razorpay` (`server/src/routes/webhooks.js`), configured in the
  Razorpay Dashboard (Test Mode) against `payment_link.paid`, `payment_link.expired`, and
  `payment_link.cancelled` (defensive — this system never exposes a cancel action). Mounted before
  the global `express.json()` parser so it receives the untouched **raw** request body, verified
  against `RAZORPAY_WEBHOOK_SECRET` using the `X-Razorpay-Signature` header
  (HMAC-SHA256 over the raw body, hex-encoded) per Razorpay's documented webhook signature scheme.
  `payment_link.paid` resolves the case to `RECOVERED`; `payment_link.expired`/`.cancelled` resolve
  it to `FAILED` (which, per § Payment state machine, re-enters `ANALYZING` on the next
  `/evaluate` — no special-casing needed). Before mutating anything, the handler cross-checks the
  webhook's link id, amount (converted back from paise), and currency against the values already
  stored on the resolved `RecoveryCase` — merchant identity is always derived from that stored
  case, never trusted from the webhook payload itself.
- **Idempotency (delivery):** the `X-Razorpay-Event-Id` header — Razorpay's documented "unique per
  event" dedup identifier — is written to `webhook_events` first, keyed by its unique `eventId`
  index; a duplicate insert (unique index violation) short-circuits to `ALREADY_PROCESSED` before
  any state-changing logic runs. `resolveRecoveryOutcome` (`pipeline/outcomeEvaluator.js`) is also
  idempotent at the case level — a case no longer `WAITING_OUTCOME` is left untouched — so an
  out-of-order or duplicate delivery can never mutate state or credit revenue twice.
- **Recovered revenue:** `recoveredAmount` is set in exactly one place on the live path —
  `resolveRecoveryOutcome`, only after a verified `payment_link.paid` webhook has passed every
  cross-check above. It is never set at link-creation time, never speculatively, and never on a
  Razorpay failure or timeout — matching the simulated path's existing rule that recovered revenue
  is always derived from an actual outcome, never fabricated.
- **High-value cases:** the Policy Engine's existing precedence order is unchanged — an amount
  above `MAX_AUTONOMOUS_AMOUNT` resolves to `ESCALATE` before a candidate action is ever approved
  (`RECOVERY_POLICY.md` § Policy precedence), so `POST /:id/payment-link` rejects such a case
  (409) before `createLivePaymentLink` is ever called. No code path allows the Razorpay adapter to
  be reached for a case the Policy Engine hasn't approved for `CREATE_PAYMENT_LINK`.
- **Local webhook testing:** Razorpay's servers cannot reach `localhost`; exercising the webhook
  against a local dev server requires a public HTTPS tunnel (e.g. ngrok) with that URL registered
  as the webhook endpoint in the Razorpay Dashboard (Test Mode).
- **Orders API:** not used — Payment Links proved sufficient for this build's flow.

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
- **The simulated and live Razorpay paths are one function with an additive parameter, not two
  implementations.** `pipeline/actionExecutor.js`'s `CREATE_PAYMENT_LINK` branch takes an optional
  `live` flag; every pre-Day-6 caller (evaluation, `/simulate-action`, voice without Razorpay
  configured) omits it and is unaffected. This is what keeps the simulated executor permanently
  available and Razorpay-free — see § Razorpay integration plan (implemented, Day 6) — without
  duplicating the state-machine logic between the two paths.

## Agentic auto-recovery

DETECT → EVALUATE → EXECUTE stay three separate functions (`riskDetector` →
`orchestrator.runEvaluationPipeline` → `actionExecutor` / `tools.createLivePaymentLink`), each
still individually reachable via its own route. What changed is the *default trigger*: a merchant
no longer clicks through recovery for every failed payment.

- **One new orchestrator, no second engine.** `server/src/pipeline/autoRecovery.js`
  `runAutomaticRecovery()` is thin sequencing that calls the exact same functions the manual
  routes call — `runEvaluationPipeline` (as `POST /:id/evaluate`), then `createLivePaymentLink`
  (as `POST /:id/payment-link`) or the seeded `executeAction` (as `POST /:id/simulate-action`).
  The Policy Engine is never bypassed: it only ever executes an action the pipeline itself moved
  to `POLICY_APPROVED`. `ESCALATE` / `STOP` / `EXPIRE` outcomes are recorded
  (`AUTO_RECOVERY_NO_ACTION`) and surfaced for merchant review, never auto-actioned.
- **Trigger point.** `POST /api/demo/payment-failure` — the single place a `PAYMENT_FAILURE`
  recovery case is born — calls `runAutomaticRecovery` immediately after
  `REVENUE_RISK_DETECTED`. No polling loop, no background job. (Same "one pipeline, N triggers"
  shape as checkout abandonment.)
- **`START_VOICE_RECOVERY`** is a valid autonomous *decision* (the agent may pick it when
  `merchant.policy.voiceEnabled` and the score ≥ 0.75) but there is no automated outbound
  dialer, so the agent leaves the case `POLICY_APPROVED` and queues it
  (`AUTO_RECOVERY_VOICE_QUEUED`) for the merchant to run the real live Hinglish session. It
  never touches `voiceAttempts`.
- **Idempotency.** `runEvaluationPipeline` is re-entrant; the live payment-link path goes
  through `tools.js`'s atomic DB claim; a concurrent `save()` race is caught (`VersionError`)
  and the fresher document adopted. Two concurrent triggers ⇒ exactly one link, one execution,
  one audit chain.
- **Failure safety.** A failed execution releases any claim, keeps the case retryable
  (`POLICY_APPROVED`), writes `PAYMENT_LINK_CREATION_FAILED` / `AUTO_RECOVERY_FAILED`, and never
  marks the case recovered. `recoveredAmount` is still only ever credited by a verified
  `payment_link.paid` webhook.
- **Kill switch.** `AUTO_RECOVERY_ENABLED=false` (env) reverts to purely manual, merchant-driven
  recovery. It is an ops-level flag, not a merchant-facing toggle; the Payments page shows
  "Auto Recovery · Active/Off" as informational status only. The shared test harness forces it
  off so the rest of the suite can assert intermediate pipeline states; `tests/autoRecovery.test.js`
  opts back in.
