# payrevive

**AI revenue-recovery agent for Razorpay merchants** — built for the Razorpay AI Buildathon,
**Track 03: AI Revenue Recovery**.

- **Live demo:** https://payrevive.xyz — click **Enter Demo** (no signup, no credentials).
- **Backend:** deployed on Render.
- **Database:** MongoDB Atlas.
- **Status:** built and deployed. `NODE_ENV=production`; full recovery loop runs end-to-end
  against Razorpay Test Mode.

## What it does

When a payment fails, payrevive runs the full loop Track 03 asks for:

```
DETECT → DIAGNOSE → SCORE → POLICY CHECK → EXPLAIN → MERCHANT APPROVAL
       → EXECUTE → VERIFY OUTCOME → MEASURE RECOVERY → AUDIT
```

It detects the revenue at risk, diagnoses the likely cause with a deterministic lookup, scores
recoverability with a documented weighted formula, checks the case against a deterministic
merchant policy engine, explains the decision in plain language, prepares a recovery plan, and
then asks the merchant for **exactly one** confirmation. Only after that does anything reach a
customer. When a payment link is confirmed it calls Razorpay's **Test Mode** Payment Links API
for real, and revenue is counted as recovered **only** after a signature-verified
`payment_link.paid` webhook. Every decision writes an audit entry.

The AI footprint is deliberately narrow: **Google Gemini classifies a Hinglish/Devanagari voice
transcript into an intent** and nothing else. It has no database connection, no Razorpay
credentials, its output is schema-validated and advisory, and it passes through the same policy
engine as a rule-selected action. A **deterministic keyword fallback** covers clear
Hindi/Hinglish requests when Gemini is unavailable.

Full detail: `SPEC.md` (product + scope), `ARCHITECTURE.md` (system design), `AGENT_DESIGN.md`
(bounded-autonomy model), `RECOVERY_POLICY.md` (policy engine + scoring), `EVALUATION.md`
(batch evaluation), `SECURITY.md` (threat model).

## What's real vs simulated vs not shipped

**REAL (live-verified):**
- Razorpay **Test Mode** Payment Link creation — a real `POST /v1/payment_links`
  (`server/src/integrations/razorpay/`). `RecoveryAction.status = LIVE_TEST_MODE`.
- Signed webhook verification — HMAC-SHA256 over the **raw** request body against
  `RAZORPAY_WEBHOOK_SECRET`, constant-time compare, link-id / amount / currency cross-checks,
  `X-Razorpay-Event-Id` idempotency (`server/src/routes/webhooks.js`).
- The deterministic recovery pipeline — root cause, eligibility, scoring, intervention
  selection, the shared policy-precedence function, state-transition validation
  (`server/src/pipeline/`, `server/src/policy/`).
- The policy engine — ₹50,000 autonomous ceiling, 72h recovery window, 2 recovery attempts,
  1 voice attempt, opt-out, escalation, stop.
- The merchant approval gate — `POST /api/recovery-plan/:id/confirm`; no customer-facing
  action executes before it; every item re-validated at confirm time.
- Measured recovered revenue — `recoveredAmount` set in exactly one live-path place
  (`pipeline/outcomeEvaluator.js`), only after a verified webhook. Dashboard "Recovered
  Revenue" is the sum of these.
- Hinglish/Devanagari voice-intent classification via Gemini
  (`server/src/ai/gemini/voiceClassifier.js`) + the deterministic keyword fallback
  (`server/src/pipeline/deterministicVoiceIntent.js`).
- Batch evaluation — runs the actual production decision pipeline against a seeded synthetic
  dataset (`evaluation/`, `POST /api/evaluation/run`).
- Per-case and merchant-wide audit trail (`server/src/audit/`, `models/AuditLog.js`).
- Merchant isolation — every merchant-owned query is `{_id, merchantId}`-scoped; a resource
  owned by another merchant returns the same 404 as one that doesn't exist
  (`middleware/authorize.js`).

**SIMULATED / DEMO (clearly labelled in code and UI):**
- The demo dataset — 100 synthetic customers / 90 paid / 10 failed
  (`server/src/services/demoSeed.js`); every record carries `demo: true`; emails are
  `@payrevive.demo`. Reseeded to this canonical state on **every deliberate "Enter Demo"**.
- `POST /api/demo/complete-test-payment` — a demo helper that itself builds a
  `payment_link.paid` event, signs it with `RAZORPAY_WEBHOOK_SECRET`, and delivers it to the
  **real** webhook route, because automating a browser checkout in the demo is impractical.
  Signature verification, cross-checks, and idempotency all still run
  (`server/src/services/demoTestPayment.js`).
- `POST /api/recovery-cases/:id/simulate-action` and the batch evaluator — resolve outcomes
  with a seeded PRNG (mulberry32) against `recoveryProbability`; never call Razorpay;
  `RecoveryAction.status = SIMULATED`. Internal/test tooling; the case-page "Simulate Action"
  button was removed.
- The Dashboard **"Simulate Payment Failure"** control — a demo-merchant-only ingest trigger
  (fenced by `requireDemoMerchant`).

**NOT SHIPPED in this build:**
- Real merchant registration / login. Only demo authentication (`POST /api/auth/demo`) exists.
- Real outbound voice telephony. `server/src/integrations/telephony/provider.js` is a stub —
  `initiateVoiceCall()` returns a synthetic reference and places no call. The voice
  conversation is the interactive browser-mic session.
- Real SMS / WhatsApp delivery.
- **Scenario B — checkout abandonment** as a live flow. `models/CheckoutSession.js` and the
  design in `ARCHITECTURE.md` exist, but no `/api/checkout-sessions` route and no abandonment
  sweep are wired. Only Scenario A (failed payment) ships.
- Live Promise-to-Pay capture. `models/PromiseToPay.js` exists, but the voice mapper resolves
  `PAY_LATER` / `CANNOT_PAY` to `ESCALATE` (`pipeline/voiceIntentMapper.js`).
- "Connect with Razorpay" (OAuth) and the `@payrevive/sdk` — shown as disabled / illustrative
  roadmap on the Integration page; see § Connecting a Razorpay account below.

## Architecture overview

```
Browser (Chrome recommended for voice)
  │  HTTPS
  ▼
Vercel  ── static Vite build of client/ ── custom domain payrevive.xyz (HSTS)
  │        SPA rewrite (client/vercel.json): /((?!api/).*) -> /index.html
  │        deep routes + hard refresh work; /api/* is NOT rewritten
  │  fetch, JWT bearer, VITE_API_BASE_URL -> Render
  ▼
Render  ── Node 20 / Express 4  (server/src/app.js)
  │        helmet CSP+HSTS · cors(origin: CLIENT_URL) · /api/webhooks mounted BEFORE
  │        express.json() (raw body for HMAC) · per-route express-rate-limit
  │        routes ▸ auth · demo · recovery-cases · recovery-plan · dashboard ·
  │                 evaluation · audit-log · merchant/policy · merchant/integration · webhooks
  │        deterministic recovery pipeline (server/src/pipeline/)
  ▼
MongoDB Atlas  ── Mongoose, 12 models, every query merchantId-scoped
  ▲
  │
Gemini API (@google/genai)  ── voice-intent classification only; one file
                                 (ai/gemini/client.js) reads GEMINI_API_KEY;
                                 model = env.GEMINI_MODEL || "gemini-2.5-flash";
                                 deterministic keyword fallback on any failure
Razorpay Test Mode  ── integrations/razorpay/client.js (direct fetch + Basic Auth, no SDK)
```

- `client/` — React 18 + Vite + Tailwind, plain JSX. Own `package.json`.
- `server/` — Express + Mongoose. Shares the repository-root `package.json` with `tests/` and
  `evaluation/`.
- `tests/` — `node:test` suites; DB-dependent tests run against an in-memory MongoDB
  (`mongodb-memory-server`) so they never require real Atlas credentials; the Gemini provider
  boundary is exercised with a mocked provider (never a real key or network call).
- `evaluation/` — seeded synthetic dataset generator + batch evaluator that imports
  `server/src/pipeline` directly, so a run exercises the exact same decision code as production.

### Technology / runtime

| Layer | Role |
|---|---|
| **Google Gemini** (`@google/genai`) | Runtime AI. **Only** the Hinglish/Devanagari voice-intent classifier is wired live; server-side only; schema-validated advisory output; the deterministic Policy Engine is the final authority. A deterministic keyword fallback covers Gemini being unavailable. |
| **MongoDB (Atlas)** | All collections — merchants, customers, payments, recovery cases, recovery plans, webhook events, audit logs, evaluation runs. |
| **Razorpay** (Test Mode) | Payment Link creation + `payment_link.*` / `payment.failed` webhooks. `config/env.js` refuses to start with a non-`rzp_test_` key. |
| **React / Vite** | Frontend — marketing site + the merchant ops dashboard. |
| **Express** | Backend — API routes, the deterministic recovery pipeline, auth, rate limiting, webhook handling. |
| **Claude Code** | Development tool only — wrote code, docs, tests. No runtime role. See `CLAUDE.md` § AI provider. |

## Prerequisites

- Node.js 20+ (developed against Node 24)
- npm 10+
- A MongoDB Atlas connection string for real local development (**not** required to run the
  backend test suite, which uses an in-memory MongoDB automatically)

## Installation

```bash
# from the repository root — installs backend + test dependencies
npm install

# frontend has its own package.json
npm run client:install
```

## Environment variables

Copy the example files and fill in real values. Never commit the resulting `.env` files.

```bash
cp .env.example .env               # backend
cp client/.env.example client/.env.local   # frontend
```

Backend (`.env`, see `.env.example` for the full annotated list):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` / `test` / `production` |
| `PORT` | yes | backend HTTP port |
| `MONGODB_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | long random value; never reuse across environments |
| `CLIENT_URL` | yes | frontend origin, used for the CORS allowlist |
| `GEMINI_API_KEY` | for voice | server-side only, `@google/genai` SDK. Without it, voice classification uses the deterministic keyword fallback. |
| `GEMINI_MODEL` | optional | overrides the model id; defaults to `gemini-2.5-flash` (`server/src/ai/gemini/client.js`) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | for Razorpay recovery | Test Mode only — `RAZORPAY_KEY_ID` must start with `rzp_test_` or the server refuses to start |
| `RECOVERY_AUTOPLAN_ENABLED` | optional | on unless set to exactly `false`; when on, a failed-payment case is immediately run through the evaluate pipeline and recorded as a `PENDING_APPROVAL` recovery-plan item (no customer contact) |

Frontend (`client/.env.local`):

| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | backend API base URL; defaults to `http://localhost:4000/api` |

## Local development

Two terminals — backend and frontend run as separate processes:

```bash
# terminal 1 — backend, http://localhost:4000
npm run dev

# terminal 2 — frontend, http://localhost:5173
npm run client:dev
```

Backend health check: **`GET http://localhost:4000/api/health`**
Frontend: **`http://localhost:5173`** — click "Enter Demo" for the real demo-auth + reseed flow.

## Connecting a Razorpay account

A business connects PayRevive to its own Razorpay account in three escalating levels of
effort — the first needs no code:

1. **Webhook (implemented).** In the dashboard, open **Integration**. It shows a per-merchant
   webhook URL and, on an explicit "Reveal", a signing secret (the GET response only ever
   returns a mask + `hasWebhookSecret`). Paste both into the Razorpay Dashboard
   (Settings → Webhooks → Add New Webhook) and subscribe to `payment.failed`. Every failed
   payment then arrives at `POST /api/webhooks/razorpay/inbound/:webhookId`, is
   signature-verified against that secret, and flows into the same recovery pipeline the demo
   "Simulate Payment Failure" control uses — a recovery plan is prepared and queued for the
   merchant's one-click approval. Rotate the secret any time from the same page.
   See `ARCHITECTURE.md` § Inbound payment-failure webhook.
2. **Connect with Razorpay (roadmap).** One-click OAuth account connect — PayRevive would
   register the webhook and read failed payments on the merchant's behalf, no URLs or secrets
   to copy. Shown as a disabled control on the Integration page; gated on Razorpay partner
   onboarding.
3. **SDK (roadmap).** A thin server-side client for platforms that want to trigger recovery on
   custom events or pass richer customer context than the Razorpay webhook carries:

   ```js
   import { PayRevive } from "@payrevive/sdk"; // illustrative — not published

   const pr = new PayRevive({ apiKey: process.env.PAYREVIVE_API_KEY });

   // in your own payment-failure handler:
   await pr.reportFailedPayment({
     customer: { name, email, phone },
     payment: { id, amount, currency },
     failureReason: "insufficient_funds",
   });
   // → recovery case opened, plan prepared, merchant notified to confirm
   ```

## Tests

```bash
npm test            # backend + pipeline + integration suites (node:test)
npm run build       # from client/ — production Vite build
```

`npm test` runs the full `node:test` suite in `tests/` — **317 tests across 30 files** at the
time of writing: auth + demo auth + JWT (valid / expired / invalid / wrong-secret) + stale-token
recovery, merchant authorization / IDOR, the pipeline modules, the shared policy-precedence
function, recovery plans + approval gate, Razorpay unit + payment-link + platform/inbound
webhook verification + idempotency, voice recovery + the deterministic Roman/Devanagari
fallback, the batch evaluation engine, demo seed + reseed, decision rationale, dashboard
analytics, database-unreachable handling, rate limiting, and Razorpay env validation. All
deterministic — no Gemini or Razorpay credentials required; MongoDB-dependent tests run against
an in-memory database, and the Gemini provider boundary is exercised with a mocked provider.

## Deployment

| Layer | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | static Vite build of `client/`; custom domain `payrevive.xyz` with HSTS; SPA rewrite in `client/vercel.json` (`/((?!api/).*) → /index.html`) so deep routes and hard refresh resolve, while `/api/*` is left to point at the backend. |
| Backend | **Render** | Node process; env vars configured in the platform, never committed. |
| Database | **MongoDB Atlas** | shared tier. |

HTTPS everywhere; CORS locked to `CLIENT_URL`; `helmet` for standard secure headers; 100 kB
request-body limit. See `SECURITY.md` for the full model.

## Known limitations

- No real merchant registration/login — demo authentication only.
- Scenario B (checkout abandonment) and Promise-to-Pay are modelled and specified but not wired
  to live routes.
- Voice telephony is a stub (a stated non-goal — the voice experience is browser-based).
- Voice microphone input depends on the browser's Web Speech API (Chrome recommended) and a
  reachable Google speech service; the text box runs the identical pipeline as a fallback.
- Razorpay Test Mode accounts have a lifetime cap of 30 payment links — a heavily-exercised
  test account can exhaust it (the app currently surfaces the resulting `429` as a generic
  "Razorpay unavailable").
