# AGENT_DESIGN.md — Agent Architecture

## Agent architecture (conceptual model)

payrevive's agentic loop has one fixed shape, everywhere AI is involved:

```
Customer input (voice transcript / typed text)
        │
        ▼
AI Decision/Planner            Gemini API call, structured output only (responseSchema /
        │                      responseMimeType: application/json). Produces a candidate
        │                      {intent, recommendedAction, confidence, reasonCodes,
        │                      requiresHumanReview} — see § AI output contract.
        ▼
Deterministic policy/guardrail engine   Eligibility Engine + Policy Engine (RECOVERY_POLICY.md),
        │                                both built on ONE shared precedence function. Approves,
        │                                blocks, or overrides the candidate action.
        ▼
Allowlisted action              One of: CREATE_PAYMENT_LINK, START_VOICE_RECOVERY,
        │                       RECORD_PROMISE_TO_PAY, ESCALATE, STOP. Nothing else is
        │                       representable — see § Action allowlist.
        ▼
Action Executor                 The only code with Razorpay credentials and MongoDB write access.
        │
        ▼
Observation                     Razorpay webhook (live) or simulated outcome (evaluation) →
        │                       Outcome Evaluator → updated recovery_case status
        ▼
Audit Logger                    Writes every step above to audit_logs
```

**The AI Decision/Planner never touches Razorpay credentials, never opens a MongoDB connection,
and never executes an unrestricted financial action.** Its entire capability is: read a
constrained prompt containing case-safe context (amount, status, customer name — never
credentials), and return one JSON object matching the schema in § AI output contract. Everything
from "deterministic policy/guardrail engine" onward is plain backend code with no model in the
loop. This is true for every AI call in the system — currently, the only live instance of the AI
Decision/Planner is the Voice Intent Classifier (module 8 below).

**Runtime AI provider: Google Gemini, exclusively**, via the official `@google/genai` SDK.
Claude Code is the development-time coding assistant used to build payrevive; it has no runtime
role and is never called from application code. See `CLAUDE.md` § AI provider.

The model is not the policy engine, not the executor, and not the authorization layer — it
cannot bypass merchant policy. See § Provider abstraction below for how this is enforced in code.

## Why the Planner doesn't run its own tool-calling loop

*(Section numbers below refer to the original Razorpay Track 03 brief, which is external to this
repository — its text is not checked in.)*

The brief's §11 lists tool names (`getRecoveryCase`, `createPaymentLink`, etc.) in a shape that
could suggest a classic LLM function-calling agent deciding, turn by turn, which tool to invoke.
We deliberately do not build it that way, for reasons specific to this domain:

- Money movement and policy enforcement need to be provably deterministic for a security/fintech
  reviewer to trust them. A tool-calling loop makes "what will the model do next" a probabilistic
  question even with a restricted tool set.
- §10 of the brief itself requires that money, policy, thresholds, retry counts, eligibility,
  state transitions, audit records, and metrics be controlled by deterministic layers — that is
  incompatible with letting the model be the orchestrator of those layers.
- A 7-day build has no slack for debugging emergent agent-loop behavior under a security review.

Instead: the ten modules below run in a fixed, deterministic sequence, driven by plain backend
code. Every function listed in §11 of the brief exists, with the signature implied, as a backend
service function — but it is invoked by deterministic pipeline code, not chosen by the model. The
only place the AI Decision/Planner's output influences which action is taken is the Voice Intent
Classifier, and even there its `recommendedAction` is a *candidate* that the deterministic
policy/guardrail engine independently approves, blocks, or overrides. This satisfies every safety
requirement in the brief (§9–§13, §42–§44, §50–§52) while being something we can actually finish
and secure in the time available — and it is still a real agentic system in the sense that
matters: it perceives (transcript), decides (structured output), and acts (through a bounded,
audited executor) — it just doesn't hold the keys itself.

## Where AI is actually used (honesty statement)

To be explicit about what "AI" means in this product:

- **Hinglish/Devanagari voice-intent classification** — a real Gemini API call
  (`server/src/ai/gemini/voiceClassifier.js`), constrained to the structured output contract
  below, with the deterministic keyword classifier as a fallback (§ Deterministic voice-intent
  fallback). This is the one wired-live AI call and the product's actual AI differentiator.
- **Decision-factor explanation text** — the case-detail "Why PayRevive decided this" panel is
  generated **deterministically** from the already-computed fields (`pipeline/decisionRationale.js`),
  not by a Gemini call. Purely descriptive; it does not decide anything.
- **Recovery Decision/Planner** (`server/src/ai/gemini/planner.js`) — implemented and fully
  tested behind the `AIProvider` interface, but **not wired to any route** in this build.
- Root cause classification, eligibility, recovery scoring, intervention selection, and policy
  enforcement are **all deterministic rule/formula-based code**, not model calls. This is
  intentional (see above), not a limitation to apologize for — it's what makes the system
  auditable.

## The ten modules

| # | Module | Type | Responsibility |
|---|---|---|---|
| 1 | Revenue Risk Detector | deterministic | Triggered by a `payment.failed` event (real per-merchant webhook or the demo "Simulate Payment Failure" — one shared `ingestPaymentFailure`). Creates a `recovery_case` in `RISK_DETECTED`. *(Checkout-abandonment triggering — `ARCHITECTURE.md` § Checkout abandonment detection — is designed but not wired.)* |
| 2 | Root Cause Analyzer | deterministic | Maps payment failure reason / abandonment context to a root cause category (below) via a lookup table. Describes **why revenue was lost** — it never classifies a case as high-value/requiring-review; that is Policy/Eligibility territory, see § HIGH_VALUE ownership |
| 3 | Recovery Eligibility Engine | deterministic | Evaluates steps 1–4 of the shared precedence function (`RECOVERY_POLICY.md` § Policy precedence): `OPT_OUT → HIGH_VALUE_AMOUNT_CHECK → RECOVERY_WINDOW → ATTEMPT_LIMIT`. Produces `ELIGIBLE`, or routes directly to `STOPPED` / `ESCALATED` / `EXPIRED` |
| 4 | Recovery Scoring Engine | deterministic | Runs only for `ELIGIBLE` cases. Weighted formula over structured signals → `recoveryProbability` + `reasonCodes[]`; see `RECOVERY_POLICY.md` |
| 5 | Intervention Selector | deterministic | Picks among already-eligible interventions by score + root cause; does **not** re-check amount/window/attempts — see § HIGH_VALUE ownership |
| 6 | Policy Engine | deterministic | Re-runs the same shared precedence function (steps 1–5, now including the candidate action) as the final authoritative gate immediately before execution |
| 7 | Action Executor | deterministic | Executes only allowlisted, policy-approved actions via the backend service functions ("tools") below. The only module with Razorpay credentials and MongoDB write access |
| 8 | Voice Intent Classifier | **AI Decision/Planner** | Gemini API call, transcript → structured intent object, schema-validated |
| 9 | Outcome Evaluator | deterministic | Reads webhook/payment status, resolves `WAITING_OUTCOME` → `RECOVERED` / `FAILED`; `FAILED` re-enters module 3, never module 5 directly — see `ARCHITECTURE.md` § Payment state machine |
| 10 | Audit Logger | deterministic | Writes an `audit_logs` entry for every transition and decision above |

## Root cause categories

`RETRYABLE_PAYMENT_FAILURE`, `NON_RETRYABLE_PAYMENT_FAILURE`, `CUSTOMER_PAYMENT_METHOD_ISSUE`,
`CHECKOUT_ABANDONMENT`, `CUSTOMER_DECLINED`, `UNKNOWN`.

Assigned by a deterministic lookup from the Razorpay payment failure code / error description (for
Scenario A) or from checkout session state (for Scenario B). `UNKNOWN` is the explicit fallback
for anything unmapped — never silently defaulted to something more specific than the evidence
supports.

**`HIGH_VALUE_REVIEW` / `RECOVERY_WINDOW_EXPIRED` / `RETRY_LIMIT_REACHED` are not root causes.**
They describe *why an eligible-looking case was blocked*, not *why the payment failed* — that's a
policy outcome, not a diagnosis. See § HIGH_VALUE ownership below and `RECOVERY_POLICY.md` §
Policy precedence, which owns these as reason codes (`HIGH_VALUE_REQUIRES_REVIEW`,
`RECOVERY_WINDOW_EXPIRED`, `RETRY_LIMIT_REACHED`) attached to the Eligibility/Policy decision, not
to `recovery_case.rootCause`.

## HIGH_VALUE ownership

Policy/Intervention Selection — specifically the shared precedence function used by the
Eligibility Engine (module 3) and the Policy Engine (module 6) — is the **sole owner** of
high-value escalation. The Root Cause Analyzer (module 2) never sees or reasons about
`MAX_AUTONOMOUS_AMOUNT`; it only ever answers "why did this payment fail / checkout get
abandoned." When a case's amount exceeds the merchant's autonomous ceiling, the reason code
recorded is `HIGH_VALUE_REQUIRES_REVIEW`, attached to the policy decision on the case (and to the
`audit_logs` entry), never to `rootCause`. Full precedence order and worked examples are in
`RECOVERY_POLICY.md` § Policy precedence.

## Tools (backend service functions)

These are the exact functions named in the brief, implemented as internal service functions in
`/server/src/pipeline` and `/server/src/policy`, callable only by pipeline code — never by the AI
Decision/Planner directly:

- `getRecoveryCase(caseId, merchantId)` — merchant-scoped fetch, never by id alone
- `getCustomerHistory(customerId, merchantId)`
- `getPaymentDetails(paymentId, merchantId)`
- `getCheckoutDetails(checkoutSessionId, merchantId)`
- `getMerchantPolicy(merchantId)`
- `calculateRecoveryScore(case, history, policy)` — pure function, no side effects
- `createPaymentLink(case)` — full validation chain in `RECOVERY_POLICY.md`, then Razorpay call
- `recordPromiseToPay(case, promisedDate, source, conversationRef)`
- `requestMerchantEscalation(case, reason)`
- `stopRecovery(case, reason)`
- `recordRecoveryOutcome(case, outcome)`

The AI Decision/Planner never calls these directly and never receives credentials to call Razorpay
or MongoDB itself. It returns a structured recommendation; deterministic code decides which of
these functions, if any, to call.

## Provider abstraction

Business logic depends on an internal `AIProvider` interface, never on the Gemini SDK directly —
this is what makes the provider replaceable later without rewriting the Recovery Engine:

```
server/src/ai/
  provider.js           getAIProvider() → the AIProvider interface (currently always Gemini)
  schema.js              AI_DECISION_SCHEMA (ajv), ACTION_ALLOWLIST-derived enum, SAFE_FALLBACK_DECISION
  gemini/
    client.js             the ONLY file that imports @google/genai; reads GEMINI_API_KEY,
                           exposes generateStructuredContent(prompt, responseSchema)
    planner.js             GeminiProvider's planRecoveryDecision(context): builds a constrained
                           prompt from an explicit field allowlist, calls client.js, parses +
                           independently re-validates the response, and NEVER throws — any
                           failure (missing key, timeout, malformed JSON, schema violation)
                           resolves to SAFE_FALLBACK_DECISION (`recommendedAction: "ESCALATE"`)
```

```
AIProvider
    ↓
GeminiProvider   (the only implementation today)
```

The planner's `recommendedAction` is drawn from the same `ACTION_ALLOWLIST` the deterministic
Policy Engine already enforces (`policy/policyPrecedence.js`), plus `ASK_CLARIFICATION` (a
non-executable "no action" signal) — so the model cannot express a novel action even before the
Policy Engine's own structural allowlist check runs a second time. In this build the planner
module exists and is fully tested behind the `AIProvider` interface but is **not wired into any
route** — the one live Gemini call is the Voice Intent Classifier (`voiceClassifier.js`), which
does not use the planner. See `SPEC.md` and the OpenAI→Gemini migration commit for the reasoning.

## AI output contract

Applies to every Gemini call in the system — wired live: the Voice Intent Classifier; built but
unwired: the recovery Decision/Planner (`server/src/ai/schema.js`) — enforced via Gemini's
structured output (`responseSchema`/`responseMimeType: application/json`) plus independent
server-side ajv
validation:

```json
{
  "intent": "PAY_NOW | PAY_LATER | PAYMENT_METHOD_PROBLEM | CANNOT_PAY | REFUSE | UNCLEAR | HUMAN_ESCALATION",
  "recommendedAction": "CREATE_PAYMENT_LINK | RECORD_PROMISE_TO_PAY | ESCALATE | STOP | ASK_CLARIFICATION",
  "confidence": 0.0,
  "reasonCodes": ["..."],
  "requiresHumanReview": false
}
```

- Validated server-side against a JSON schema (ajv) before any code reads it, independent of
  Gemini's own schema enforcement — defense in depth, not trust.
- Any field outside the enumerated values, missing required fields, or malformed JSON is a hard
  reject — the session falls back to `UNCLEAR` and asks the customer to repeat/clarify, it never
  guesses.
- `recommendedAction` is **advisory only**. It is passed to the Intervention Selector / Policy
  Engine exactly like a deterministically-selected candidate action would be, and can be
  overridden (e.g. `PAY_NOW` + amount above the autonomous ceiling still resolves to `ESCALATE`
  via `HIGH_VALUE_REQUIRES_REVIEW`).
- Chain-of-thought is never requested or exposed; only the structured fields above and, where
  shown to the merchant, concise reason codes.

## Action allowlist

`CREATE_PAYMENT_LINK`, `START_VOICE_RECOVERY`, `RECORD_PROMISE_TO_PAY`, `ESCALATE`, `STOP`. Any
value outside this set — from AI output, from a client request body, or from anywhere else — is
rejected before it reaches the Policy Engine. This check is structural (a set membership test),
distinct from the Policy Engine's business-rule checks. (`RECORD_PROMISE_TO_PAY` is a valid
allowlist value but is never currently produced — `voiceIntentMapper.js` routes `PAY_LATER` /
`CANNOT_PAY` to `ESCALATE`; see `RECOVERY_POLICY.md` § Promise-to-Pay lifecycle.)

## Voice pipeline

As implemented in `server/src/routes/voice.js` (mounted at `/api/recovery-cases/:id/voice` by
`routes/recoveryCases.js`, after `requireAuth` + `requireMerchantOwnership`). A session lifecycle,
not a single call:

```
Browser mic (Chrome recommended — best Web Speech API support for Hinglish code-switched speech)
   │  webkitSpeechRecognition → transcript (text). Text-input fallback available at all times,
   │  feeding the EXACT SAME downstream pipeline. On a "network" speech error the UI shows a
   │  calm "type your response below" message — the mic uses a Google cloud service the browser
   │  may not reach; this is a Web Speech API environment limit, not a PayRevive failure.
   ▼
POST /api/recovery-cases/:id/voice/session       → { sessionId }  (increments voiceAttempts,
   │                                                 writes VOICE_SESSION_STARTED)
   ▼
POST /api/recovery-cases/:id/voice/turn  { sessionId, transcript }
   ▼
provider.classifyVoiceIntent(transcript, …)
   │  Gemini API call (responseSchema / responseMimeType: application/json) → ajv validation.
   │  On ANY failure (missing key, timeout, HTTP 4xx/5xx incl. a wrong GEMINI_MODEL, non-JSON,
   │  schema violation) → deterministic keyword fallback (see § Deterministic voice-intent
   │  fallback). No match → UNCLEAR.
   ▼
pipeline/voiceIntentMapper.js: classified intent → candidate action (a pure lookup)
   ▼
pipeline/orchestrator.js runVoiceDecisionPipeline: the SAME Eligibility + Policy Engine as text
   │  recovery. UNCLEAR (candidateAction == null) → clarification response, nothing mutates.
   ▼
If the turn resolves to POLICY_APPROVED + CREATE_PAYMENT_LINK:
   │   Razorpay configured  → createLivePaymentLink() in this turn (the exact same path as
   │                          POST /:id/payment-link; case → WAITING_OUTCOME)
   │   Razorpay not configured → the seeded simulated executor (status SIMULATED)
   │  There is NO separate in-voice affirmative-confirmation turn. The one approval gate for a
   │  PLANNED case is POST /api/recovery-plan/:id/confirm; the flow above is the manual
   │  voice-override path for a case that has not yet been planned.
   ▼
Response text: two forms (ai/gemini/responseGenerator.js) — `response` (Roman Hinglish, shown)
   │  and `speechText` (Devanagari, spoken via browser SpeechSynthesis). Deterministic per-outcome
   │  bilingual template on any Gemini failure; never freely-generated text for an amount/outcome.
   ▼
POST /api/recovery-cases/:id/voice/session/end   → writes VOICE_SESSION_ENDED
Audit at every step: VOICE_SESSION_STARTED, VOICE_INTENT_DETECTED, AI_RECOMMENDATION_CREATED,
POLICY_EVALUATED (+ the pipeline events), the action's event, VOICE_RESPONSE_GENERATED,
VOICE_SESSION_ENDED.
```

Amount, currency, customer, and merchant are **always** read from the server-side recovery case,
never from the transcript, the model's output, or any client-supplied value.

No telephony is built (a stated non-goal in `SPEC.md`) — `integrations/telephony/provider.js` is
a stub. The experience is entirely browser-based; the text-input fallback exists specifically so
the product still works end-to-end in browsers with weak or no speech recognition support, using
the identical classification → policy → action pipeline.

**Voice UI states** (`client/src/pages/VoiceRecovery.jsx` `STATUS_LABELS`): `IDLE, READY,
LISTENING, THINKING, RESPONDING, ENDED`. The decision panels are driven by view modes derived in
`client/src/lib/voiceRecoveryView.js` (`terminal, started, limit_reached, awaiting_confirmation,
non_voice, startable, unavailable`) from the case status + policy + current recovery plan.

## Deterministic voice-intent fallback

`server/src/pipeline/deterministicVoiceIntent.js` — the **only** fallback used when
`classifyVoiceIntent` can't use Gemini. It is intentionally not NLP: a short, transparent,
ordered list of high-signal phrases in **both Roman/Hinglish and Devanagari**, each mapped to an
**existing** `VOICE_INTENTS` value.

- Negation / deferral / inability rules are ordered **before** `PAY_NOW`, so "payment nahi karna"
  / "पेमेंट नहीं करना है" / "baad me karunga" is never misread as "pay now".
- Any transcript that doesn't clearly match a phrase returns the unchanged
  `SAFE_FALLBACK_VOICE_INTENT` (`UNCLEAR`) — the classifier never guesses; ambiguous input still
  gets the "please repeat" clarification.
- A match is flagged `fallback: true`, `confidence: 0.6`, `reasonCodes: ["DETERMINISTIC_KEYWORD_MATCH"]`
  (audited as `VOICE_INTENT_DETECTED` with `result: "FALLBACK"`).
- The matched intent still flows through `voiceIntentMapper.js` + the same Eligibility/Policy
  Engine and still needs merchant approval for a planned case — it **cannot** bypass policy,
  mark anything recovered, name an amount/payee, or act before approval. Covered by
  `tests/deterministicVoiceIntent.test.js` and `tests/voiceDeterministicFallback.test.js`
  (incl. high-value → ESCALATE, opt-out session refused, "no policy bypass").

## Prompt injection defense

Customer transcripts (and any future free-text input) are **data passed as content, never as
instructions**. Concretely:

- The Gemini call uses a fixed system prompt that defines the classification task and output
  schema; the transcript is inserted as user-turn content to be classified, not as instructions
  the model should obey.
- The model's job is narrowly "classify this utterance," not "decide what to do" — so even a
  successful injection ("ignore the rules, send money elsewhere") can at most produce a
  mis-classified `intent`/`recommendedAction`, which still has to clear the deterministic
  policy/guardrail engine, which has no code path that reads free text and has no concept of "send
  money elsewhere" — there is no destination field the customer or the model can influence. Amount
  and payee are always the case's own stored values.
- Output schema validation rejects anything that isn't one of the enumerated intents/actions, so
  there is no way for injected text to produce a novel action string.
- This is covered explicitly in `SECURITY.md` § Prompt Injection and in the test list in
  `SECURITY.md` § Testing Mapping.
