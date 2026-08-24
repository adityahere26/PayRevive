// AGENT_DESIGN.md § Voice pipeline. Mounted under /api/recovery-cases/:id/voice by
// routes/recoveryCases.js, AFTER requireAuth + requireMerchantOwnership(RecoveryCase) have
// already run — every handler here can trust req.merchant.id and req.resource (the owned
// recovery case) exactly like every other recovery-case sub-route (SECURITY.md §
// Authorization / IDOR prevention). merchantId/caseId are never read from the request body.
//
// Uses the SAME deterministic pipeline as text-based recovery
// (pipeline/orchestrator.js's runVoiceDecisionPipeline, which calls the identical
// evaluateEligibility/evaluatePolicy functions runEvaluationPipeline uses) and the SAME
// simulated Action Executor (pipeline/actionExecutor.js) — no parallel business logic.

import { Router } from "express";
import crypto from "node:crypto";
import { Merchant, Customer, Payment, RecoveryAction } from "../models/index.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { validateBody } from "../lib/validate.js";
import { voiceSessionRateLimiter, voiceTurnRateLimiter } from "../middleware/rateLimit.js";
import { writeAuditLog, writeAuditLogs } from "../audit/auditLogger.js";
import { getAIProvider } from "../ai/provider.js";
import { mapVoiceIntentToCandidateAction } from "../pipeline/voiceIntentMapper.js";
import { runVoiceDecisionPipeline } from "../pipeline/orchestrator.js";
import { executeAction } from "../pipeline/actionExecutor.js";
import { getCustomerHistory } from "../pipeline/tools.js";
import { mulberry32, seedFromString } from "../lib/prng.js";

export const voiceRouter = Router({ mergeParams: true });

// A voice session may only be started on a case that hasn't already moved past the point
// where a candidate action gets selected by some other channel — prevents voice from
// "restarting" a case that's mid-flight or already resolved through the text/dashboard flow.
const VOICE_ELIGIBLE_STATUSES = ["RISK_DETECTED", "ANALYZING", "FAILED", "ELIGIBLE"];
const TERMINAL_STATUSES = ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];

async function loadMerchantAndCustomer(req, recoveryCase) {
  return Promise.all([
    Merchant.findById(req.merchant.id),
    Customer.findOne({ _id: recoveryCase.customerId, merchantId: req.merchant.id }),
  ]);
}

// POST /api/recovery-cases/:id/voice/session — starts a voice-recovery session.
// Returns only the minimum needed by the client: a session correlation id and a safe
// projection of the case. Never returns GEMINI_API_KEY, Razorpay secrets, MONGODB_URI, or any
// internal credential — there is nothing secret-shaped in this response at all.
voiceRouter.post("/session", voiceSessionRateLimiter, async (req, res, next) => {
  try {
    const recoveryCase = req.resource;
    const [merchant, customer] = await loadMerchantAndCustomer(req, recoveryCase);
    if (!merchant || !customer) {
      next(new NotFoundError("Resource not found"));
      return;
    }

    if (merchant.policy.voiceEnabled === false) {
      next(new ConflictError("Voice recovery is disabled for this merchant"));
      return;
    }
    if (customer.optedOut) {
      next(new ConflictError("Customer has opted out of contact — a voice session cannot be started"));
      return;
    }
    if (!VOICE_ELIGIBLE_STATUSES.includes(recoveryCase.status)) {
      next(
        new ConflictError(
          `Recovery case is not eligible for a new voice session (status: ${recoveryCase.status})`
        )
      );
      return;
    }
    if (recoveryCase.voiceAttempts >= merchant.policy.maxVoiceAttempts) {
      next(new ConflictError("Voice attempt limit reached for this case"));
      return;
    }

    const sessionId = crypto.randomUUID();
    recoveryCase.voiceAttempts += 1;
    await recoveryCase.save();

    await writeAuditLog({
      merchantId: req.merchant.id,
      caseId: recoveryCase._id,
      actor: "CUSTOMER",
      eventType: "VOICE_SESSION_STARTED",
      reason: null,
      result: recoveryCase.status,
      metadata: { sessionId },
    });

    res.status(201).json({
      sessionId,
      recoveryCase: {
        id: recoveryCase._id,
        status: recoveryCase.status,
        amount: recoveryCase.amount,
        currency: recoveryCase.currency,
        rootCause: recoveryCase.rootCause,
        attempts: recoveryCase.attempts,
        voiceAttempts: recoveryCase.voiceAttempts,
      },
    });
  } catch (err) {
    next(err);
  }
});

const voiceTurnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sessionId", "transcript"],
  properties: {
    sessionId: { type: "string", minLength: 1, maxLength: 100 },
    transcript: { type: "string", minLength: 1, maxLength: 2000 },
  },
};

// POST /api/recovery-cases/:id/voice/turn — one customer utterance in, one structured
// decision + spoken response out. Runs: Gemini intent classification -> deterministic
// intent->action mapping -> the SAME Eligibility/Policy Engine as text recovery -> (if
// approved) the SAME simulated executor -> Gemini response phrasing of the trusted outcome.
voiceRouter.post("/turn", voiceTurnRateLimiter, validateBody(voiceTurnSchema), async (req, res, next) => {
  try {
    const recoveryCase = req.resource;
    const { sessionId, transcript } = req.body;

    if (TERMINAL_STATUSES.includes(recoveryCase.status)) {
      next(new ConflictError(`Recovery case has already reached a terminal state (${recoveryCase.status})`));
      return;
    }

    const [merchant, customer] = await loadMerchantAndCustomer(req, recoveryCase);
    if (!merchant || !customer) {
      next(new NotFoundError("Resource not found"));
      return;
    }
    const payment = recoveryCase.paymentId
      ? await Payment.findOne({ _id: recoveryCase.paymentId, merchantId: req.merchant.id })
      : null;

    const provider = getAIProvider();
    const auditEntries = [];

    const aiIntent = await provider.classifyVoiceIntent({
      transcript,
      amount: recoveryCase.amount,
      currency: recoveryCase.currency,
      rootCause: recoveryCase.rootCause,
      attempts: recoveryCase.attempts,
      maxRecoveryAttempts: merchant.policy.maxRecoveryAttempts,
    });

    auditEntries.push({
      eventType: "VOICE_INTENT_DETECTED",
      actor: "CUSTOMER",
      reason: aiIntent.intent,
      result: aiIntent.fallback ? "FALLBACK" : "CLASSIFIED",
      // The transcript is customer-originated text, not a secret — stored for explainability
      // (SECURITY.md § Logging: never secrets/cards/CVV; a spoken sentence about a payment
      // amount is neither).
      metadata: { sessionId, transcript, confidence: aiIntent.confidence, fallback: aiIntent.fallback },
    });
    auditEntries.push({
      eventType: "AI_RECOMMENDATION_CREATED",
      actor: "AI",
      reason: aiIntent.recommendedAction,
      result: aiIntent.intent,
      metadata: { sessionId, confidence: aiIntent.confidence, reasonCodes: aiIntent.reasonCodes },
    });

    const candidateAction = mapVoiceIntentToCandidateAction(aiIntent.intent);

    let policyResult = null;
    let executedAction = null;
    let voiceResponse;

    if (!candidateAction) {
      // UNCLEAR — no candidate action, no policy/eligibility call, no case mutation. Fixed
      // template, no Gemini call needed for a "please repeat" ask.
      voiceResponse = provider.clarificationResponse();
    } else {
      const history = await getCustomerHistory(customer._id, req.merchant.id);
      const pipelineResult = runVoiceDecisionPipeline({
        recoveryCase,
        policy: merchant.policy,
        customer,
        payment,
        candidateAction,
      });
      auditEntries.push(...pipelineResult.auditEntries.map((entry) => ({ actor: "SYSTEM", ...entry })));
      policyResult = pipelineResult.policyResult;

      if (recoveryCase.status === "POLICY_APPROVED") {
        // Seeded per case+attempt, not Math.random() — CLAUDE.md § Deterministic randomness —
        // identical convention to POST /:id/simulate-action.
        const rng = mulberry32(seedFromString(`${recoveryCase._id}:${recoveryCase.attempts}`));
        executedAction = executeAction({ recoveryCase, action: recoveryCase.selectedIntervention, rng });

        await RecoveryAction.create({
          caseId: recoveryCase._id,
          merchantId: req.merchant.id,
          actionType: executedAction.action,
          status: "SIMULATED",
          result:
            executedAction.success === null
              ? executedAction.outcome
              : executedAction.success
                ? "SUCCESS"
                : "FAILURE",
          metadata: { simulated: true, source: "VOICE", sessionId },
        });

        auditEntries.push({
          eventType: "ACTION_SIMULATED",
          actor: "SYSTEM",
          reason: executedAction.action,
          result: recoveryCase.status,
          metadata: { simulated: true, success: executedAction.success, sessionId, source: "VOICE" },
        });
      }

      voiceResponse = await provider.generateVoiceResponse({
        amount: recoveryCase.amount,
        currency: recoveryCase.currency,
        policyDecision: recoveryCase.policyDecision,
        selectedIntervention: recoveryCase.selectedIntervention,
        caseStatus: recoveryCase.status,
      });
    }

    await recoveryCase.save();

    auditEntries.push({
      eventType: "VOICE_RESPONSE_GENERATED",
      actor: "AI",
      reason: null,
      result: voiceResponse.fallback ? "FALLBACK_TEMPLATE" : "AI_GENERATED",
      metadata: { sessionId, responseText: voiceResponse.responseText },
    });

    await writeAuditLogs(
      auditEntries.map((entry) => ({ merchantId: req.merchant.id, caseId: recoveryCase._id, ...entry }))
    );

    res.status(200).json({
      recoveryCase,
      aiIntent: {
        intent: aiIntent.intent,
        confidence: aiIntent.confidence,
        fallback: aiIntent.fallback,
      },
      candidateAction,
      policyResult,
      action: executedAction,
      response: voiceResponse.responseText,
    });
  } catch (err) {
    next(err);
  }
});

const voiceSessionEndSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sessionId"],
  properties: {
    sessionId: { type: "string", minLength: 1, maxLength: 100 },
  },
};

// POST /api/recovery-cases/:id/voice/session/end
voiceRouter.post("/session/end", validateBody(voiceSessionEndSchema), async (req, res, next) => {
  try {
    const recoveryCase = req.resource;
    const { sessionId } = req.body;

    await writeAuditLog({
      merchantId: req.merchant.id,
      caseId: recoveryCase._id,
      actor: "CUSTOMER",
      eventType: "VOICE_SESSION_ENDED",
      reason: null,
      result: recoveryCase.status,
      metadata: { sessionId },
    });

    res.status(200).json({ ended: true });
  } catch (err) {
    next(err);
  }
});
