// Unit tests for the Voice Recovery page's state derivation
// (client/src/lib/voiceRecoveryView.js) under the approval-gated recovery-plan architecture.
// Pure function — no React harness, no server. The rule under test: the UI must never offer an
// action the backend would reject, and it must reflect the recovery plan's real state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveVoiceRecoveryView } from "../client/src/lib/voiceRecoveryView.js";

const POLICY = { maxVoiceAttempts: 1, voiceEnabled: true };

function view(recoveryCase, { policy = POLICY, plan = null } = {}) {
  return deriveVoiceRecoveryView({ recoveryCase, policy, plan });
}

// 1 — voice attempts exhausted -------------------------------------------------------------
test("1: voice attempts exhausted → limit_reached, no start button, shows X / Y used", () => {
  const v = view({
    _id: "c1",
    status: "POLICY_APPROVED",
    selectedIntervention: "START_VOICE_RECOVERY",
    voiceAttempts: 1,
  });
  assert.equal(v.mode, "limit_reached");
  assert.equal(v.headline, "Unavailable");
  assert.match(v.message, /limit reached/i);
  assert.equal(v.showStartButton, false);
  assert.equal(v.attemptsUsed, 1);
  assert.equal(v.attemptsLimit, 1);
});

test("1b: exhausted also applies before analysis (manual sessions used the budget)", () => {
  const v = view({ _id: "c1b", status: "ANALYZING", selectedIntervention: null, voiceAttempts: 1 });
  assert.equal(v.mode, "limit_reached");
  assert.equal(v.showStartButton, false);
});

// 2 — voice intervention pending plan approval -------------------------------------------
test("2: voice intervention + plan PENDING_APPROVAL → awaiting_confirmation, CTA to recovery plan, no start", () => {
  const v = view(
    { _id: "c2", status: "POLICY_APPROVED", selectedIntervention: "START_VOICE_RECOVERY", voiceAttempts: 0 },
    { plan: { status: "PENDING_APPROVAL", items: [{ caseId: "c2", intervention: "START_VOICE_RECOVERY", status: "PENDING" }] } }
  );
  assert.equal(v.mode, "awaiting_confirmation");
  assert.equal(v.headline, "Awaiting confirmation");
  assert.equal(v.showStartButton, false);
  assert.equal(v.ctaLabel, "Go to Recovery Plan");
  assert.equal(v.ctaTo, "/payments");
});

test("2b: voice intervention with no plan loaded still gates behind confirmation (never a direct start)", () => {
  const v = view({ _id: "c2b", status: "POLICY_APPROVED", selectedIntervention: "START_VOICE_RECOVERY", voiceAttempts: 0 }, { plan: null });
  assert.equal(v.mode, "awaiting_confirmation");
  assert.equal(v.showStartButton, false);
});

// 3 — voice intervention approved & executed -------------------------------------------
test("3: plan item EXECUTED → started, no start button", () => {
  const v = view(
    { _id: "c3", status: "POLICY_APPROVED", selectedIntervention: "START_VOICE_RECOVERY", voiceAttempts: 1 },
    { plan: { status: "COMPLETED", items: [{ caseId: "c3", intervention: "START_VOICE_RECOVERY", status: "EXECUTED" }] } }
  );
  assert.equal(v.mode, "started");
  assert.equal(v.headline, "Started");
  assert.equal(v.showStartButton, false);
});

// 4 — voice intervention executing ---------------------------------------------------
test("4: plan EXECUTING → started/Starting, no start button", () => {
  const v = view(
    { _id: "c4", status: "POLICY_APPROVED", selectedIntervention: "START_VOICE_RECOVERY", voiceAttempts: 0 },
    { plan: { status: "EXECUTING", items: [{ caseId: "c4", intervention: "START_VOICE_RECOVERY", status: "PENDING" }] } }
  );
  assert.equal(v.mode, "started");
  assert.equal(v.headline, "Starting");
  assert.equal(v.showStartButton, false);
});

// 5 — non-voice intervention -------------------------------------------------------
test("5: selectedIntervention is CREATE_PAYMENT_LINK → non_voice, shows the real intervention, no voice action", () => {
  const v = view({ _id: "c5", status: "POLICY_APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK", voiceAttempts: 0 });
  assert.equal(v.mode, "non_voice");
  assert.equal(v.headline, "Create payment link");
  assert.match(v.message, /not a voice call/i);
  assert.equal(v.showStartButton, false);
  assert.equal(v.ctaTo, "/recovery-cases/c5");
});

// 6 — no action / escalated / stopped -------------------------------------------
test("6a: escalated case → terminal, no start button", () => {
  const v = view({ _id: "c6a", status: "ESCALATED", selectedIntervention: null, voiceAttempts: 0 });
  assert.equal(v.mode, "terminal");
  assert.equal(v.headline, "Escalated");
  assert.equal(v.showStartButton, false);
});

test("6b: stopped case → terminal, no start button", () => {
  const v = view({ _id: "c6b", status: "STOPPED", selectedIntervention: null, voiceAttempts: 0 });
  assert.equal(v.mode, "terminal");
  assert.equal(v.showStartButton, false);
});

test("6c: freshly detected case, no decision yet → startable manual override (backend accepts POST /voice/session here)", () => {
  const v = view({ _id: "c6c", status: "RISK_DETECTED", selectedIntervention: null, voiceAttempts: 0 });
  assert.equal(v.mode, "startable");
  assert.equal(v.showStartButton, true);
});

test("6d: voice turned off in policy → unavailable, no start button", () => {
  const v = view(
    { _id: "c6d", status: "ANALYZING", selectedIntervention: null, voiceAttempts: 0 },
    { policy: { maxVoiceAttempts: 1, voiceEnabled: false } }
  );
  assert.equal(v.mode, "unavailable");
  assert.equal(v.showStartButton, false);
});

test("6e: WAITING_OUTCOME (payment link sent) → unavailable, no voice action", () => {
  const v = view({ _id: "c6e", status: "WAITING_OUTCOME", selectedIntervention: "CREATE_PAYMENT_LINK", voiceAttempts: 0 });
  // non-voice intervention wins → non_voice, still no start button
  assert.equal(v.showStartButton, false);
  assert.notEqual(v.mode, "startable");
});

// cross-cutting: a start button is offered in exactly one mode -------------------
test("the start button is only ever offered for the manual-override 'startable' mode", () => {
  const cases = [
    { status: "RISK_DETECTED", selectedIntervention: null, voiceAttempts: 0 }, // startable
    { status: "ANALYZING", selectedIntervention: null, voiceAttempts: 0 }, // startable
    { status: "POLICY_APPROVED", selectedIntervention: "START_VOICE_RECOVERY", voiceAttempts: 0 }, // awaiting
    { status: "POLICY_APPROVED", selectedIntervention: "START_VOICE_RECOVERY", voiceAttempts: 1 }, // limit
    { status: "POLICY_APPROVED", selectedIntervention: "CREATE_PAYMENT_LINK", voiceAttempts: 0 }, // non_voice
    { status: "ESCALATED", selectedIntervention: null, voiceAttempts: 0 }, // terminal
    { status: "RECOVERED", selectedIntervention: "CREATE_PAYMENT_LINK", voiceAttempts: 0 }, // terminal
  ];
  for (const c of cases) {
    const v = view({ _id: "x", ...c });
    assert.equal(v.showStartButton, v.mode === "startable", `mode ${v.mode} should${v.mode === "startable" ? "" : " not"} offer start`);
  }
});
