# SECURITY.md — Security Model

## Threat model checklist

Authentication · Authorization/IDOR · Injection · XSS · CSRF (where applicable) · CORS · SSRF ·
Rate limiting · Secret leakage · Webhook spoofing · Duplicate webhook processing · Prompt
injection · Malicious tool arguments · Amount tampering · Merchant isolation · Sensitive logging.
Each is addressed below; this list is revisited verbatim before deployment (per `SPEC.md` §
Judging alignment checklist).

## Authentication

- JWT bearer tokens for merchant sessions (`POST /api/auth/login`, `/register`).
- Standard merchant JWTs expire after **7 days**; there is no silent renewal — expiry forces a
  fresh login.
- Passwords hashed with **bcrypt**; never logged, never returned in any response.

### Demo authentication

- `POST /api/auth/demo` (rate-limited — see § Rate limiting) issues a token for a single,
  pre-seeded **demo merchant** record, with no credentials required, so evaluators can use
  "Enter Demo" immediately.
- **Expiration:** demo tokens are short-lived — **2 hours** — deliberately shorter than a real
  merchant session, to limit the exposure window of a token anyone can mint.
- **Authorization scope:** a demo token carries exactly the same authorization claims and passes
  through exactly the same `merchantId`-scoping middleware as a real merchant token (see §
  Authorization / IDOR prevention). It is not a privileged or reduced-privilege role, and it
  cannot access, modify, or escalate into any other merchant's data — **demo tokens never bypass
  authorization**, they are simply pre-authenticated for one specific, isolated merchant record.
- **Demo merchant isolation:** the demo merchant is a distinct, clearly-flagged (`isDemo: true`)
  document with its own `merchantId`; all data it creates (recovery cases, evaluation runs) is
  scoped to it exactly as any other merchant's data would be, and is reseeded/reset on a schedule
  so one evaluator's session can't corrupt another's demo experience.
- `POST /api/auth/demo` deliberately does **not** accept any client-supplied merchant identifier
  or role claim — the demo merchant's identity is hardcoded server-side, closing off any path to
  requesting a token for an arbitrary/other merchant.

## Authorization / IDOR prevention

- Every merchant-owned resource query is scoped by `merchantId` at the database query level, not
  filtered after the fact — e.g. `RecoveryCase.findOne({ _id: caseId, merchantId: req.merchant.id })`,
  never `findById(caseId)` followed by an ownership check.
- A resource that exists but belongs to a different merchant returns the same `404` as a resource
  that does not exist at all — never a `403` that would confirm existence to an unauthorized
  caller.
- This pattern applies uniformly to recovery cases, customers, payments, audit logs, policy, and
  evaluation runs — enforced by a shared middleware/helper, not reimplemented per route.

## Input and AI output validation

- Every request body validated against an ajv JSON schema before touching business logic.
- The AI output contract (`AGENT_DESIGN.md`) is validated the same way; invalid AI output is
  rejected outright, never coerced or partially trusted.
- Amount, customerId, merchantId, and caseId are **never** taken from the request body/client for
  any state-changing action — always re-derived server-side from the authenticated session and
  the stored case record (see `RECOVERY_POLICY.md` § Payment Link safety checklist).

## Rate limiting

Applied via `express-rate-limit`, tightest on the routes most exposed to abuse:

| Route | Limit rationale |
|---|---|
| `POST /api/auth/login` | brute-force protection |
| `POST /api/auth/demo` | unauthenticated token-minting endpoint — limited per-IP to prevent token-flooding or using it as a free path to hammer other endpoints under fresh tokens |
| `POST /api/recovery-cases/:id/voice-intent` | prevents runaway Gemini API cost / spam sessions |
| `POST /api/recovery-cases/:id/payment-link` | prevents payment-link spam against Razorpay |
| `POST /api/recovery-cases/:id/execute` | prevents unlimited recovery-action triggering |
| `POST /api/evaluation/run` | expensive (500–1000 pipeline runs); tightly limited |
| `POST /api/webhooks/razorpay` | generous but present, to absorb retries without abuse |

## CORS

`Access-Control-Allow-Origin` restricted to `FRONTEND_URL` from environment configuration —
never `*` where credentials (the JWT bearer) are involved.

## Secrets

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GEMINI_API_KEY`,
  `MONGODB_URI` read from environment variables only (`process.env.GEMINI_API_KEY`, read exactly
  once in `server/src/config/env.js`), backend-only. Never sent to, embedded in, or bundled into
  frontend code — never prefixed `VITE_`, never referenced from anything under `client/`.
  `GEMINI_API_KEY` authenticates payrevive's runtime AI provider (Google Gemini, via the official
  `@google/genai` SDK) — unrelated to Claude Code, the development tool used to build the
  project, which has no runtime footprint and is never called from application code.
- `.env` is never committed; `.env.example` documents required variable names with empty values.
- Secrets are never logged, including in error logs — the structured error handler strips known
  secret-shaped fields before any log write; this also covers `GEMINI_API_KEY`-shaped metadata
  (`lib/logger.js`'s redaction pattern matches any key/token/secret-shaped field name).

## Gemini / AI provider security

Consolidated statement of the guarantees around the runtime AI provider (see also
`AGENT_DESIGN.md` § Provider abstraction for the code boundary these are enforced through):

- **Google Gemini is the runtime AI provider.** Claude Code is development tooling only and has
  no runtime role — see `CLAUDE.md` § AI provider.
- **`GEMINI_API_KEY` is server-side only**, read from `process.env.GEMINI_API_KEY` in exactly one
  place (`server/src/ai/gemini/client.js`, the only file that imports `@google/genai`). It is
  never hardcoded, never committed to Git, and never exposed to the client.
- **Gemini never receives Razorpay secrets** (`RAZORPAY_KEY_ID`/`_SECRET`/`_WEBHOOK_SECRET`) or
  raw payment credentials (card numbers, CVV, UPI PINs) — the prompt-building function
  (`buildRecoveryPrompt`) reads an explicit allowlist of case-safe fields only (amount, currency,
  root cause, customer name, attempt counts) and never serializes an entire context/case object,
  so an unexpected field can never leak into a prompt even if a future caller passes more than it
  should.
- **Gemini cannot directly access MongoDB** and cannot directly execute a payment operation —
  the AI Decision/Planner (`server/src/ai/`) has no database connection and no Razorpay client;
  its entire capability is "receive a constrained prompt, return one JSON object."
- **Deterministic policy/guardrails remain the final authority.** Every `recommendedAction`
  Gemini returns is advisory only — the same Eligibility Engine / Policy Engine
  (`RECOVERY_POLICY.md` § Policy precedence) that governs a deterministically-selected candidate
  action governs an AI-recommended one, with no separate, weaker code path.
- **AI output is untrusted input.** It is schema-validated server-side with ajv
  (`server/src/ai/schema.js`, independent of Gemini's own `responseSchema` enforcement) before
  any code reads it; malformed JSON, a missing required field, or an out-of-allowlist
  `recommendedAction` is a hard reject, never coerced or partially trusted.
- **Actions are allowlisted structurally**, not just by business rule: `recommendedAction`'s
  schema `enum` is the same `ACTION_ALLOWLIST` the Policy Engine enforces, plus
  `ASK_CLARIFICATION` (never passed to the Policy Engine as a candidate action) — see § Action
  allowlist in `AGENT_DESIGN.md`.
- **Merchant isolation and audit logging are unaffected by the provider change** — nothing about
  the Gemini integration alters `requireMerchantOwnership`, the `merchantId`-scoped query
  pattern, or the audit event contract (`AGENT_DESIGN.md` § The ten modules, Audit Logger).
- **Fail-safe on any AI failure.** A missing key, timeout, rate limit, network error, malformed
  response, or schema violation never results in an unauthorized action — the planner resolves to
  a safe fallback decision (`recommendedAction: "ESCALATE"`) instead of throwing or guessing; see
  `server/src/ai/schema.js`'s `SAFE_FALLBACK_DECISION` and the planner tests in
  `tests/aiProvider.test.js`.

## Webhook security

- Signature verified using the **raw** request body (captured before JSON parsing middleware
  runs) against `RAZORPAY_WEBHOOK_SECRET`, per Razorpay's documented HMAC scheme — exact header
  confirmed against current Razorpay docs at implementation time (see `ARCHITECTURE.md`).
- Every inbound event is first inserted into `webhook_events` keyed by a unique `eventId`; a
  duplicate is caught by the unique index and short-circuited to `ALREADY_PROCESSED` before any
  state-changing code runs — this is what prevents double-counted recovered revenue on retried or
  out-of-order deliveries.
- `webhook_events` stores `eventId, eventType, receivedAt, processedAt, status, payloadHash,
  processingError` — a hash of the payload, not the full sensitive payload itself.

## Prompt injection

Covered in depth in `AGENT_DESIGN.md` § Prompt Injection Defense. Summary: customer transcripts
are passed to the Gemini model as content to classify, never as instructions; the model's output
space is a closed enum validated server-side; the Policy Engine has no code path through which
classified text can alter policy, thresholds, amount, or destination — those values are never
derived from model output or customer input.

## Frontend security

- No sensitive credentials in `localStorage` beyond the JWT itself (accepted tradeoff for a
  demo-first SPA; documented, not silently assumed safe).
- Frontend never trusts client-side role/permission state for anything beyond UI display — every
  authorization decision is re-checked server-side regardless of what the UI shows.
- Transcript and any other untrusted text is rendered as text content, not injected as HTML, to
  prevent stored/reflected XSS via customer-originated voice transcripts.

## Logging / observability

Structured logs include `requestId, timestamp, route, status, duration` for HTTP requests;
`caseId, action, result, latency` for pipeline actions; `eventId, eventType, processingStatus`
for webhooks. Never logged: API secrets, card details, CVV, auth tokens, full sensitive payment
payloads.

## Error handling

Uniform error shape (`ARCHITECTURE.md` § API contract) with a `requestId` for correlation; stack
traces are never returned to the client in any environment, only written to server-side logs.

## Testing mapping

Critical tests required (implemented in `/tests`, per `CLAUDE.md` definition of done):

- Customer refuses (`REFUSE`) → `STOP`, no further attempts
- Retry limit reached → `STOP`
- High-value payment → `ESCALATE`, no autonomous execution
- Opted-out customer → no contact of any kind
- Valid recovery → action allowed end-to-end
- Invalid/blocked policy state → action blocked, audited
- Duplicate webhook event → no double recovery, no double-counted revenue
- Payment already recovered → no second action executed
- Manipulated amount from frontend → backend rejects, uses server-side case amount
- Wrong merchant accessing another merchant's case → `404`, not `403`, not the data
- Malformed/off-schema AI output → rejected, session falls back to clarification, no action taken
- Injection-style transcript content ("ignore the rules," "send money elsewhere") → produces at
  most a classification result, never a policy bypass or novel action
- High-value case that has ALSO expired or exhausted its attempt limit → still resolves to
  `ESCALATE` (`HIGH_VALUE_REQUIRES_REVIEW`), never silently to `EXPIRED`/`STOPPED` (policy
  precedence order)
- Customer explicitly refuses on a high-value case → `STOP`, not `ESCALATE` (opt-out/refusal
  takes precedence over high-value escalation)
- Retry after a failed attempt → re-enters eligibility and policy checks; never jumps straight to
  action execution
- Demo token → cannot access another merchant's data, expires after its short TTL, and is
  rate-limited on issuance

## Deployment security

HTTPS enforced on both Vercel and Render; environment variables configured in each platform's
secret store, never committed; `helmet` applied for standard secure headers; request body size
limits set on all routes, tightest on the webhook and voice-intent routes.
