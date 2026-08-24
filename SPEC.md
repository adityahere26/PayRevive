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

Two revenue-loss scenarios, chosen for depth over breadth.

### Scenario A — Failed Payment Recovery

Trigger: a payment fails.

Pipeline: detect revenue risk → retrieve payment/customer context → diagnose failure (root
cause) → determine recovery eligibility → calculate recovery probability → select intervention →
check merchant policy → execute allowed action → observe payment outcome → record recovered
revenue → update metrics → write audit events.

Possible interventions: Razorpay Payment Link, Hinglish Voice Recovery, Retry (where technically
and policy appropriate), Promise-to-Pay, Merchant Escalation, Stop.

### Scenario B — Checkout Abandonment Recovery

Trigger: a customer starts checkout but does not complete payment.

Pipeline: detect abandoned checkout → calculate revenue at risk → evaluate customer/context →
determine recovery probability → select intervention → apply policy → execute allowed recovery
action → record outcome.

Possible interventions: Payment Link, Hinglish Voice Recovery, Reminder, Promise-to-Pay,
Escalation, Stop.

**Detection mechanism (both real and demo use the identical backend pipeline — see
`ARCHITECTURE.md` § Checkout abandonment detection):**
- **Real:** a `checkout_session` created when checkout starts is detected as abandoned once it
  sits in `started` status past a configurable timeout with no successful payment.
- **Demo trigger:** an explicit "Simulate checkout abandonment" action (`POST
  /api/checkout-sessions/:id/simulate-abandonment`) marks a session abandoned immediately and
  invokes the exact same detection pipeline, so evaluators don't have to wait out a real timeout
  to see Scenario B end-to-end.

No other loss scenarios are in scope for the MVP.

## Hero feature — Hinglish Voice Recovery

A browser-based voice experience (no outbound telephony infrastructure; **Chrome is the
recommended/supported demo browser** for its Web Speech API support) where the customer speaks
naturally in Hinglish (e.g. *"Haan, abhi payment kar deta hoon"*, *"Abhi nahi kar sakta,
kal karunga"*, *"Card ka issue aa raha hai"*, *"UPI se kar sakta hoon"*, *"Nahi karna"*). The
transcript is classified by **payrevive's runtime AI provider, Google Gemini**, into one of: `PAY_NOW`,
`PAY_LATER`, `PAYMENT_METHOD_PROBLEM`, `CANNOT_PAY`, `REFUSE`, `UNCLEAR`, `HUMAN_ESCALATION`. A
text-input fallback runs through the identical downstream pipeline for browsers without reliable
speech support. See `AGENT_DESIGN.md` § Agent architecture for the classification pipeline and
`RECOVERY_POLICY.md` for what each intent triggers.

Reference examples this build must reproduce and demo:
- **PAY_NOW → recovery:** ₹2,999, 8 prior successful payments, 87% recovery probability, voice
  allowed by policy → confirm → create Razorpay Test Mode Payment Link → customer pays in test
  mode → case shows `RECOVERED — ₹2,999`.
- **PAY_LATER → Promise-to-Pay:** stores `recoveryCaseId, customerId, amount, promisedDate,
  createdAt, status, source, conversationRef`. UI shows "PROMISE RECORDED — Next follow-up:
  Tomorrow." No claim of an actual SMS/WhatsApp reminder being sent (none is implemented in MVP).
- **REFUSE → Stop:** no repeated attempts; audit trail `VOICE_INTENT_DETECTED(REFUSE) →
  RECOVERY_STOPPED`.
- **High-value → Escalation:** e.g. ₹1,50,000 against a ₹50,000 autonomous ceiling →
  `STOP_AUTONOMOUS_ACTION → ESCALATE_TO_MERCHANT`, never autonomously executed.

## Feature priority

### P0 — must work
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
- Hinglish voice recovery
- Promise-to-pay
- Checkout abandonment scenario
- Recovery analytics (funnel, intervention breakdown)
- Polished recovery case detail page

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

Revisited before submission (see also `SECURITY.md` § Final Review and item 65 of the original
brief):

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
