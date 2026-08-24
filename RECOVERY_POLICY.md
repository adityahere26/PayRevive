# RECOVERY_POLICY.md — Policy Engine, Scoring, and Intervention Selection

The Eligibility Engine and the Policy Engine are deterministic and authoritative, and both defer
to one shared precedence function (below) so they can never disagree about a case's fate. The AI
Decision/Planner (Voice Intent Classifier) can recommend an action; only the shared precedence
function, via the Policy Engine, can approve one for execution.

## Merchant policy fields and MVP defaults

| Field | Default | Meaning |
|---|---|---|
| `MAX_RECOVERY_ATTEMPTS` | 2 | total contact attempts per case, any channel |
| `MAX_VOICE_ATTEMPTS` | 1 | voice-specific sub-limit within the above |
| `MAX_AUTONOMOUS_AMOUNT` | ₹50,000 | above this, no autonomous action — force escalation |
| `RECOVERY_WINDOW_HOURS` | 72 | case is not eligible after this window from failure/abandonment |
| `ESCALATION_AMOUNT` | = `MAX_AUTONOMOUS_AMOUNT` unless merchant sets separately | threshold triggering mandatory human review |
| `OPT_OUT_BEHAVIOR` | `DO_NOT_CONTACT` | opted-out customers are never contacted by any channel |
| `MAX_CONTACT_ATTEMPTS` | = `MAX_RECOVERY_ATTEMPTS` (kept distinct per brief; may diverge later) | ceiling on total contact events, including non-executed attempts where applicable |
| `voiceEnabled` | `true` | gates whether a voice-recovery session can be started at all for this merchant. Checked before any Gemini call — `false` never starts a session, never silently degrades to a different channel. |

Configurable per merchant via `GET/PUT /api/merchant/policy` (see `ARCHITECTURE.md`).

## Policy precedence (single shared function)

This is the deterministic backbone of "bounded autonomy," and the fix for a design issue caught
in review: originally, window-expiry and attempt-limit checks ran *before* the high-value amount
check, which meant a high-value case that had also expired or exhausted its attempts could be
silently resolved as `EXPIRED`/`STOPPED` instead of escalated to the merchant. That is now
structurally impossible, because both the Eligibility Engine (module 3, first pass) and the
Policy Engine (module 6, final gate before execution) call the **same ordered function**:

```
function evaluatePrecedence(recoveryCase, policy, customer, candidateAction):

  # 0. structural — always first, not a business rule
  if candidateAction is set and candidateAction not in ACTION_ALLOWLIST:
      return REJECT("INVALID_ACTION")

  # 1. OPT_OUT
  if customer.optedOut and candidateAction != STOP:
      return STOP_RESULT("OPT_OUT_BEHAVIOR")   # only STOP is ever approved for an opted-out customer
  if candidateAction == STOP:
      return APPROVE()                          # stopping is always safe and is never blocked by
                                                  # anything below — this is what lets an explicit
                                                  # customer refusal win over a high-value escalation

  # 2. HIGH_VALUE_AMOUNT_CHECK  (evaluated before window/attempts, on purpose)
  if recoveryCase.amount > policy.MAX_AUTONOMOUS_AMOUNT:
      return ESCALATE_RESULT("HIGH_VALUE_REQUIRES_REVIEW")
      # No autonomous action of any kind executes for this case, regardless of how much of the
      # recovery window remains or how many attempts have been made.

  # 3. RECOVERY_WINDOW
  if now() > recoveryCase.recoveryWindowExpiresAt:
      return EXPIRE_RESULT("RECOVERY_WINDOW_EXPIRED")

  # 4. ATTEMPT_LIMIT
  if recoveryCase.attempts >= policy.MAX_RECOVERY_ATTEMPTS:
      return STOP_RESULT("RETRY_LIMIT_REACHED")

  # 5. OTHER POLICY RULES — action-specific, only meaningful once a candidate action exists;
  #    the Eligibility Engine's first pass runs steps 0–4 with candidateAction unset and stops
  #    here with ELIGIBLE. The Policy Engine's final-gate pass runs the full function.
  if candidateAction == START_VOICE_RECOVERY and recoveryCase.voiceAttempts >= policy.MAX_VOICE_ATTEMPTS:
      return BLOCK_RESULT("MAX_VOICE_ATTEMPTS_REACHED")

  return APPROVE()
```

Conceptual order, matching the required precedence exactly:
`OPT_OUT → HIGH_VALUE_AMOUNT_CHECK → RECOVERY_WINDOW → ATTEMPT_LIMIT → OTHER POLICY RULES`

**How the two stages use it:**
- **Eligibility Engine (module 3)** calls `evaluatePrecedence(case, policy, customer, null)`
  immediately after root cause analysis, using only steps 0–4. A `STOP_RESULT` /
  `ESCALATE_RESULT` / `EXPIRE_RESULT` here sends the case straight to `STOPPED` / `ESCALATED` /
  `EXPIRED` — scoring and intervention selection never run for such a case, since its fate is
  already decided. Only `APPROVE()` (i.e. none of steps 1–4 fired) produces `ELIGIBLE`.
- **Policy Engine (module 6)** calls the same function again after the Intervention Selector has
  proposed a `candidateAction`, now exercising step 5 as well, as the final authoritative gate
  immediately before `ACTION_EXECUTED`. Re-running steps 1–4 here is not redundant: time has
  passed since the first pass (the recovery window could have expired mid-request, or — on a
  retry — the attempt count has just incremented), so re-checking is what makes the guarantee
  hold on every path, not just the first one.
- **Retry re-entry:** a `FAILED` outcome (`ARCHITECTURE.md` § Payment state machine) always routes
  back into the Eligibility Engine, never directly to the Intervention Selector — so a retry
  always re-runs steps 0–4 against the incremented `attempts`, and, if it proceeds, steps 0–5
  again at the Policy Engine gate.

**Required outcome, verified against this function:** if `amount > MAX_AUTONOMOUS_AMOUNT`, the
result is `ESCALATE` regardless of expiry or attempt count — because step 2 runs before steps 3
and 4 — **unless** the customer has explicitly opted out or refused, in which case step 1 has
already returned `STOP` before the amount is ever considered. This matches the operational
requirement: a customer's refusal to be contacted is honored even for high-value cases, but a
merely-expired window or exhausted attempt count never suppresses an escalation the merchant
should see.

This function is what a test suite exercises directly — see `SECURITY.md` § Testing mapping for
the required cases (high-value + expired → still `ESCALATE`; high-value + refused → `STOP`; retry
never skips re-evaluation).

## Recovery scoring

Runs only for cases the Eligibility Engine marked `ELIGIBLE` (i.e., that passed steps 0–4 above).
A transparent, weighted formula — never "the model says 87%." Each component is normalized to
`[0, 1]`, weighted, summed, and clamped to `[0, 1]`.

```
recoveryProbability =
    0.30 * successRatio        # prevSuccessfulPayments / (prevSuccessful + prevFailed + 1)
  + 0.20 * rootCauseFactor      # RETRYABLE=1.0, PAYMENT_METHOD_ISSUE=0.6, ABANDONMENT=0.5,
                                 # NON_RETRYABLE/CUSTOMER_DECLINED=0.1
  + 0.15 * recencyFactor        # 1.0 if <=6h since failure, linear decay to 0 at RECOVERY_WINDOW_HOURS
  + 0.15 * activityFactor       # 1.0 if customer active in last 30 days, else 0.3
  + 0.10 * priorRecoveryFactor  # customer's historical recovery success rate (0.5 default if none)
  + 0.10 * attemptPenalty       # 1.0 - 0.3 * attemptsSoFar, floored at 0
```

Reason codes are derived from which components are strong, e.g.:
`successRatio > 0.7 → PREVIOUS_SUCCESSFUL_PAYMENTS`, `rootCauseFactor == 1.0 → RETRYABLE_FAILURE`,
`recencyFactor > 0.6 → WITHIN_RECOVERY_WINDOW`, `activityFactor == 1.0 → ACTIVE_CUSTOMER`.

**Worked example (the reference voice case):** ₹2,999, 8/8 prior successful payments,
`RETRYABLE_PAYMENT_FAILURE`, failure ~2 hours old, active customer, no prior recovery history,
first attempt →
`successRatio ≈ 0.30*0.89 + 0.20*1.0 + 0.15*1.0 + 0.15*1.0 + 0.10*0.5 + 0.10*1.0 ≈ 0.87` →
`87%`, reason codes `[PREVIOUS_SUCCESSFUL_PAYMENTS, RETRYABLE_FAILURE, ACTIVE_CUSTOMER,
WITHIN_RECOVERY_WINDOW]` — matching the brief's example exactly by construction. Exact weights
and cutoffs are tunable during implementation but must remain a documented formula, not a
black-box adjustment.

## Intervention selection (decision table)

Runs only for cases already `ELIGIBLE` (passed § Policy precedence steps 0–4). Intervention
Selection does **not** re-check opt-out, amount, window, or attempts — that is exclusively
Eligibility Engine / Policy Engine territory (see `AGENT_DESIGN.md` § HIGH_VALUE ownership). Its
only job is choosing which allowed intervention best fits an already-eligible case:

1. `rootCause in {NON_RETRYABLE_PAYMENT_FAILURE, CUSTOMER_DECLINED}` → `STOP`
2. Otherwise, by `recoveryProbability`:
   - `>= 0.75` and `voiceAttempts < MAX_VOICE_ATTEMPTS` and voice enabled → `START_VOICE_RECOVERY`
   - `0.40 – 0.74` → `CREATE_PAYMENT_LINK`
   - `0.15 – 0.39` → `CREATE_PAYMENT_LINK` (lower priority/expectation)
   - `< 0.15` → `STOP`
3. Scenario B (`CHECKOUT_ABANDONMENT`) follows the same bands; Reminder is a P1 addition layered
   on top of `CREATE_PAYMENT_LINK` where implemented.

Whatever this table proposes is still a *candidate* — the Policy Engine (§ Policy precedence,
step 5 plus a fresh steps 1–4 re-check) has final say before anything executes.

Thresholds are initial values chosen for demo legibility and are documented as tunable, not hard
physical constants.

## Voice intent → outcome mapping

| Intent | Deterministic result |
|---|---|
| `PAY_NOW` | propose `CREATE_PAYMENT_LINK` → **explicit confirmation required** → execute on affirmative |
| `PAY_LATER` | `RECORD_PROMISE_TO_PAY` (see lifecycle below) |
| `PAYMENT_METHOD_PROBLEM` | offer alternate method framing, still resolves to `CREATE_PAYMENT_LINK` (link supports multiple methods) or `STOP`/`ESCALATE` per policy |
| `CANNOT_PAY` | `RECORD_PROMISE_TO_PAY` if a future date is offered, else `STOP` |
| `REFUSE` | `STOP` — immediate, no repeated attempts, audited as `VOICE_INTENT_DETECTED(REFUSE) → RECOVERY_STOPPED`. Wins over high-value escalation per § Policy precedence step 1 |
| `UNCLEAR` | re-ask for clarification; no action executes |
| `HUMAN_ESCALATION` | `ESCALATE` |

## Promise-to-Pay lifecycle

`PENDING` (on creation) → `FULFILLED` (payment observed before/at promised date) or `BROKEN`
(promised date passed, no payment) — transition evaluated by the Outcome Evaluator, not asserted
by voice input. Fields: `recoveryCaseId, customerId, amount, promisedDate, createdAt, status,
source (VOICE|MANUAL), conversationRef`. No SMS/WhatsApp reminder is claimed unless a real
integration exists (none in MVP) — the UI states "Next follow-up: Tomorrow" as an internal
tracking marker, not a claim that a message was sent.

## Stopping rules (all must hold: no repeated attempts after)

- Customer explicitly refuses (`REFUSE` intent) — always wins, per § Policy precedence step 1,
  even on a high-value case
- `MAX_RECOVERY_ATTEMPTS` reached (§ Policy precedence step 4)
- Customer opted out (never contacted in the first place; step 1)
- Root cause is non-retryable / customer declined (Intervention Selector step 1)

Recovery-window expiry (step 3) resolves to `EXPIRED`, a distinct terminal state from `STOPPED`,
per `ARCHITECTURE.md` § Payment state machine.

## Escalation rule

`amount > MAX_AUTONOMOUS_AMOUNT` → `HIGH_VALUE_REQUIRES_REVIEW` → `ESCALATE_TO_MERCHANT`. Per §
Policy precedence, this is evaluated **before** window-expiry and attempt-limit checks, so it
cannot be shadowed by them — the only thing that outranks it is an explicit customer opt-out or
in-session refusal (step 1). No autonomous action of any kind (payment link, voice, retry)
executes for such a case; it is queued for merchant review. Example: ₹1,50,000 against the
₹50,000 default ceiling → `ESCALATE`, even if that case is also past its recovery window or has
already used its retry attempts.

## Payment Link safety checklist (enforced server-side, in order, before any Razorpay call)

1. Recovery case exists.
2. Case `merchantId` matches the authenticated merchant.
3. Case is not already `RECOVERED`.
4. A payment link has not already been created for this case unnecessarily (idempotent — reuse
   the existing active link rather than creating a duplicate).
5. § Policy precedence has already resolved to `APPROVE` for `CREATE_PAYMENT_LINK` (this
   checklist is the executor's own defense-in-depth, not a substitute for that gate).
6. Amount used for the Razorpay call is the case's stored `amount`, never a client-supplied value.
7. `recoveryWindowExpiresAt` has not passed.
8. `attempts < MAX_RECOVERY_ATTEMPTS`.

Any failure returns a structured `RECOVERY_POLICY_BLOCKED` (or equivalent) error and writes an
audit event; it never silently no-ops.
