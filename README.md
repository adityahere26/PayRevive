# payrevive

AI revenue recovery agent for merchants — built for the Razorpay AI Buildathon, Track 03: AI
Revenue Recovery.

**Status: Day 2 foundation only.** This README describes what is actually implemented right
now, not the full product described in `SPEC.md`. See § Implementation status below before
assuming any feature works.

## What this is (product vision — not all built yet)

payrevive detects revenue at risk from payment failures or checkout abandonment, diagnoses the
likely cause, determines a recovery intervention, checks it against deterministic merchant
policy, executes the allowed action, observes the outcome, and records what was actually
recovered. Full product spec: `SPEC.md`. Architecture: `ARCHITECTURE.md`. Agent design:
`AGENT_DESIGN.md`. Policy engine: `RECOVERY_POLICY.md`. Evaluation methodology: `EVALUATION.md`.
Security model: `SECURITY.md`.

## Implementation status (Day 2 foundation)

**Implemented and tested:**
- Express backend with centralized config, structured error handling, request logging (no
  secrets logged), CORS allowlist, security headers (helmet), body size limits.
- MongoDB/Mongoose connection layer that stays up and reports honest status even when the
  database is unreachable.
- All 11 Mongoose models from `ARCHITECTURE.md` § Database schema (Merchant, Customer,
  Payment, CheckoutSession, RecoveryCase, RecoveryAction, RecoveryAttempt, PromiseToPay,
  WebhookEvent, AuditLog, EvaluationRun) — schemas, enums, indexes, merchant-isolation fields.
  No business logic wired to them yet.
- Demo authentication (`POST /api/auth/demo`): isolated, idempotent demo merchant, JWT with
  minimal claims, 2-hour expiry, rate-limited.
- JWT auth middleware + a reusable, tested merchant-ownership authorization middleware
  (`requireMerchantOwnership`) — the same 404-not-403 IDOR-safe pattern every future
  merchant-owned resource route will use.
- Reusable AJV request-validation middleware.
- `GET /api/health` (application status, database connectivity, environment, timestamp).
- React/Vite/Tailwind frontend shell: routing for all 8 planned pages, a centralized API
  client, and a working Demo Entry → Dashboard flow that calls the real backend.

**Not implemented yet** (do not assume these work):
- The recovery pipeline (revenue risk detection, root cause analysis, scoring, intervention
  selection, policy engine execution) — `AGENT_DESIGN.md`'s ten modules are documented, not
  built.
- Razorpay integration (payment links, webhooks).
- Hinglish voice recovery (Google Gemini integration).
- The batch evaluation engine.
- Real merchant registration/login (only the demo entry point exists).
- All page content beyond the Dashboard's live health check — the other 7 pages are
  intentionally-labeled placeholders.

## Architecture overview

```
Browser → React/Vite frontend (client/) → Express backend (server/) → MongoDB Atlas
                                                ↓ (not yet wired to a live route)
                                    Razorpay Test Mode · Gemini API (@google/genai)
```

- `client/` — React + Vite + Tailwind CSS, plain JavaScript. Own `package.json`.
- `server/` — Express + Mongoose backend. Shares the repository-root `package.json` with
  `tests/` and (later) `evaluation/`.
- `tests/` — `node:test` suites; DB-dependent tests run against an in-memory MongoDB
  (`mongodb-memory-server`, a devDependency) so they never require real Atlas credentials, and
  the Gemini provider boundary is tested with a mocked provider (never a real `GEMINI_API_KEY`
  or network call) — see `tests/aiProvider.test.js`.
- `evaluation/` — not implemented yet (Day 6).

Full detail: `ARCHITECTURE.md`.

### Technology / runtime architecture

| Layer | Role |
|---|---|
| **Claude Code** | Development tool only — writes code, docs, tests. No runtime role. See `CLAUDE.md` § AI provider. |
| **Google Gemini** (`@google/genai`) | payrevive's runtime AI planner — the recovery Decision/Planner and (later) Hinglish voice intent classification. Server-side only, advisory-only output; the deterministic Policy Engine remains the final authority. See `AGENT_DESIGN.md` § Provider abstraction. |
| **MongoDB (Atlas)** | Persistent storage for all collections — merchants, customers, payments, recovery cases, audit logs, etc. |
| **Razorpay** | Payment integration — Test Mode Payment Links + webhook (not yet implemented). |
| **React / Vite** | Frontend — dashboard, recovery case views. |
| **Express** | Backend — API routes, deterministic recovery pipeline, auth, rate limiting. |

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

| Variable | Required now? | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` / `test` / `production` |
| `PORT` | yes | backend HTTP port |
| `MONGODB_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | long random value; never reuse across environments |
| `CLIENT_URL` | yes | frontend origin, used for the CORS allowlist |
| `GEMINI_API_KEY` | not yet | server-side only; needed once the Gemini-backed voice/planner phase is wired into a live route (`@google/genai` SDK) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | not yet | needed starting the Razorpay integration phase |

Frontend (`client/.env.local`):

| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | backend API base URL, defaults to `http://localhost:4000/api` |

## Local development

Two terminals — backend and frontend run as separate processes:

```bash
# terminal 1 — backend, http://localhost:4000
npm run dev

# terminal 2 — frontend, http://localhost:5173
npm run client:dev
```

Backend health check: **`GET http://localhost:4000/api/health`**
Frontend: **`http://localhost:5173`** — click "Enter Demo" to exercise the real demo-auth flow.

## Connecting a Razorpay account

A business connects PayRevive to its own Razorpay account in three escalating levels of
effort — the first needs no code:

1. **Webhook (today).** In the dashboard, open **Integration**. It shows a per-merchant
   webhook URL and a signing secret. Paste both into the Razorpay Dashboard
   (Settings → Webhooks → Add New Webhook) and subscribe to `payment.failed`. Every failed
   payment then arrives at `POST /api/webhooks/razorpay/inbound/:webhookId`, is
   signature-verified against that secret, and flows into the same recovery pipeline the demo
   "Simulate Payment Failure" control uses — a recovery plan is prepared and queued for the
   merchant's one-click approval. Rotate the secret any time from the same page.
   See `ARCHITECTURE.md` § Inbound payment-failure webhook.
2. **Connect with Razorpay (roadmap).** One-click OAuth account connect — PayRevive registers
   the webhook and reads failed payments on the merchant's behalf, no URLs or secrets to copy.
   Shown as a disabled control on the Integration page; gated on Razorpay partner onboarding.
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
npm test
```

Runs the full `node:test` suite in `tests/` (17 tests as of the Day 2 foundation): health
endpoint, database-unreachable handling, demo authentication, JWT verification (valid,
expired, invalid, wrong-secret), demo-auth rate limiting, merchant authorization/IDOR
prevention, and request validation. All deterministic — no Gemini or Razorpay credentials
required; MongoDB-dependent tests run against an in-memory database, and the Gemini provider
boundary (`tests/aiProvider.test.js`) is exercised with a mocked provider.

## Deployment

Not deployed yet. Planned: frontend → Vercel, backend → Render, database → MongoDB Atlas
(`ARCHITECTURE.md` § Deployment topology).

## Limitations

This is a foundation, not a working product. See § Implementation status above. Every
placeholder page and unbuilt feature is labeled as such in the UI and in this document — see
`CLAUDE.md` § core engineering principles ("never pretend").
