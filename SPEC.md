# SPEC.md — Product Specification

## Track requirement

Razorpay AI Buildathon, Track 03 — AI Revenue Recovery. The objective is to **detect revenue at
risk, determine the right intervention, and execute a bounded recovery workflow**, demonstrating
the complete loop:

```
DETECT → DIAGNOSE → DECIDE → POLICY CHECK → ACT → OBSERVE → RECOVER → MEASURE → AUDIT
```

Identifying failed payments alone does not satisfy the track. Every case must be traceable
through all nine stages, with an audit trail proving it happened.

## Product

- **Name:** payrevive
- **Tagline:** Detect revenue at risk. Recover what can be recovered. Stop when it should.
- **Description:** payrevive is an AI revenue recovery agent for merchants. It detects revenue at
  risk from payment failures or checkout abandonment, diagnoses the likely cause, determines the
  appropriate recovery intervention, checks that intervention against deterministic merchant
  policy, executes the allowed action, observes the outcome, and records the amount actually
  recovered.
- **Hero feature:** Hinglish Voice Recovery — a browser-based voice conversation with the
  customer, conducted in natural Hinglish, that classifies intent and drives a bounded recovery
  action. Voice is **one intervention inside the system**, not the product itself — payrevive is
  not a voice chatbot.

## MVP scope

Two revenue-loss scenarios were designed; **Scenario A is implemented and deployed end-to-end;
Scenario B is modelled and specified below but is not wired to a live route in this build.**

### Scenario A — Failed Payment Recovery — **implemented, deployed**

Trigger: a payment fails (real per-merchant `payment.failed` webhook
`POST /api/webhooks/razorpay/inbound/:webhookId`, or the demo "Simulate Payment Failure"
control — one shared ingest, `server/src/services/paymentFailureIngest.js`).

Pipeline: detect revenue risk → retrieve payment/customer context → diagnose failure (root
cause) → determine recovery eligibility → calculate recovery probability → select intervention →
check merchant policy → **prepare a recovery plan and wait for one merchant confirmation** →
execute allowed action → observe payment outcome via a verified Razorpay webhook → record
recovered revenue → update metrics → write audit events.

Interventions implemented: **Razorpay Test Mode Payment Link, Hinglish/Devanagari Voice
Recovery, Merchant Escalation, Stop.** Retry is handled by the state machine (`FAILED` re-enters
`ANALYZING`, re-running eligibility/policy) rather than a distinct action. **Promise-to-Pay is
not shipped** — see § Hero feature and `RECOVERY_POLICY.md` § Voice intent → candidate action
mapping.

### Scenario B — Checkout Abandonment Recovery — **modelled/specified, NOT wired**

`server/src/models/CheckoutSession.js` exists and the detection design is below, but there is
**no `/api/checkout-sessions` route and no abandonment sweep** in this build. Nothing described
in this subsection runs.

Trigger (as designed): a customer starts checkout but does not complete payment.

Pipeline (as designed): detect abandoned checkout → calculate revenue at risk → evaluate
customer/context → determine recovery probability → select intervention → apply policy → execute
allowed recovery action → record outcome. Interventions (as designed): Payment Link, Voice
Recovery, Reminder, Promise-to-Pay, Escalation, Stop.

Detection mechanism **as designed** (not built): a `checkout_session` in `started` status past a
configurable timeout with no successful payment would be marked `abandoned` and invoke the same
Revenue Risk Detector; a `POST /api/checkout-sessions/:id/simulate-abandonment` demo trigger
would do the same immediately.

No other loss scenarios are in scope.

## Hero feature — Hinglish Voice Recovery

A browser-based voice experience (no outbound telephony infrastructure; **Chrome is the
recommended/supported demo browser** for its Web Speech API support) where the customer speaks
naturally in Hinglish/Devanagari (e.g. *"Haan, abhi payment kar deta hoon"*, *"Ek baar phir try
karwa do"*, *"पेमेंट लिंक भेज दो"*, *"Nahi karna"*). The transcript is classified by **payrevive's
runtime AI provider, Google Gemini** (`server/src/ai/gemini/voiceClassifier.js`), into one of:
`PAY_NOW`, `PAY_LATER`, `PAYMENT_METHOD_PROBLEM`, `CANNOT_PAY`, `REFUSE`, `UNCLEAR`,
`HUMAN_ESCALATION`. **When Gemini is unavailable** (missing key, timeout, HTTP error incl. a
wrong `GEMINI_MODEL`, unusable output), a **bounded deterministic keyword classifier**
(`server/src/pipeline/deterministicVoiceIntent.js`, Roman/Hinglish + Devanagari, negation-first,
existing intents only) is used; anything not clearly matched stays `UNCLEAR`. A text-input
fallback runs through the identical downstream pipeline for browsers without reliable speech
support. See `AGENT_DESIGN.md` § Voice pipeline and `RECOVERY_POLICY.md` § Voice intent →
candidate action mapping.

Reference examples the build demonstrates:
- **PAY_NOW → recovery:** the seeded ₹2,999 `insufficient_funds` case (root cause
  `RETRYABLE_PAYMENT_FAILURE`, recovery probability ≈ **65%**, band → `CREATE_PAYMENT_LINK`) →
  merchant confirms the recovery plan → real Razorpay Test Mode Payment Link → customer pays in
  Test Mode → verified `payment_link.paid` webhook → case shows `RECOVERED — ₹2,999`. *(The 87%
  figure in `RECOVERY_POLICY.md` § Recovery scoring is the illustrative 8/8-history archetype,
  not this seeded row.)*
- **PAY_LATER / CANNOT_PAY:** currently resolve to **`ESCALATE`**. Promise-to-Pay capture
  (`models/PromiseToPay.js`) is **not implemented** in this build; there is no "PROMISE RECORDED"
  UI and no SMS/WhatsApp reminder.
- **REFUSE → Stop:** no repeated attempts; audit trail `VOICE_INTENT_DETECTED(REFUSE)` → case
  `STOPPED`.
- **High-value → Escalation:** the seeded ₹74,999 case (> the ₹50,000 autonomous ceiling) →
  `HIGH_VALUE_REQUIRES_REVIEW` → `ESCALATED`, never autonomously executed.

## Feature priority

### P0 — must work — **all implemented and deployed**
- Revenue risk detection
- Recovery decision engine (root cause, eligibility, scoring, intervention selection)
- Policy engine (deterministic, authoritative)
- Batch evaluation over synthetic data
- Recovered revenue measurement (honest, derived from outcomes)
- Audit trail (complete, per event list in `AGENT_DESIGN.md`)
- Razorpay Test Mode Payment Link creation
- Webhook processing (signature-verified, idempotent)
- One complete end-to-end recovery flow (failure → link → test payment → webhook → recovered →
  dashboard)
- Stopping rules
- Escalation
- Live deployment

### P1 — high value
- Hinglish/Devanagari voice recovery — **implemented** (Gemini + deterministic fallback)
- Promise-to-pay — **not shipped** (`PAY_LATER`/`CANNOT_PAY` resolve to `ESCALATE`)
- Checkout abandonment scenario — **not shipped** (modelled only; no live route)
- Recovery analytics (funnel, intervention breakdown) — **implemented** (Dashboard)
- Polished recovery case detail page — **implemented** ("Why PayRevive decided this" + Decision
  Trail + full audit)

### P2 — only if time remains
- Advanced analytics
- Additional channels (SMS/WhatsApp — real integration, not simulated claims)
- Additional AI providers beyond Gemini (the MVP runtime uses Google Gemini exclusively)
- Advanced personalization
- Animation/visual polish beyond baseline

P0 is never sacrificed for P1/P2 work.

## Non-goals for this MVP

- No real outbound telephony (no Twilio-style voice calls) — the voice experience is browser-based.
- No real SMS/WhatsApp delivery unless an actual integrated service is built and clearly labeled
  as such; otherwise the UI states "not implemented in MVP."
- No support for every possible failure/abandonment scenario — only the two specified.
- No Razorpay Live Mode usage anywhere.
- No multi-currency support beyond INR.
- No arbitrary LLM tool execution, arbitrary DB/HTTP/shell access for the AI layer.

## Judging alignment checklist

The numbered original Razorpay brief is **external to this repository** (it is referenced by
section number in `AGENT_DESIGN.md` and here, but its text is not checked in). This checklist is
the working restatement of Track 03's requirement. Demo note: the demo merchant is reseeded to
the canonical 100 / 90 / 10 state on **every deliberate "Enter Demo"** (not on a schedule), so
each evaluator session starts pristine.

Revisited before submission (see also `SECURITY.md` § Testing mapping):

- [ ] Does this satisfy Track 03's full DETECT→...→AUDIT loop, not just failed-payment listing?
- [ ] Is recovered revenue measurable and honestly derived (not fabricated)?
- [ ] Are all actions bounded (allowlist + policy engine + amount ceiling)?
- [ ] Are stopping rules demonstrated (customer refusal, retry limit)?
- [ ] Is escalation demonstrated (high-value case)?
- [ ] Is the audit trail complete for a full case lifecycle?
- [ ] Is Razorpay actually integrated (Test Mode Payment Link + webhook), not mocked?
- [ ] Is webhook handling secure and idempotent?
- [ ] Can an evaluator use the live URL immediately, with no signup, via Demo Mode?
- [ ] Is the architecture understandable from the docs alone?
- [ ] Does the AI layer add real value (Hinglish NLU) rather than being decorative?
- [ ] Does it read as a real product, not a vibe-coded demo?
