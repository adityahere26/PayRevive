import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";

// CLAUDE.md § Day 3 § 14 Recovery Case Detail — "This page is extremely important for the
// eventual judge demo because it makes every money action explainable." Shows the case's
// current decision state plus the full audit trail rendered as a timeline.

const TIMELINE_STEPS = [
  { eventType: "REVENUE_RISK_DETECTED", label: "Revenue Risk Detected" },
  { eventType: "ROOT_CAUSE_IDENTIFIED", label: "Root Cause Identified" },
  { eventType: "ELIGIBILITY_EVALUATED", label: "Eligibility Checked" },
  { eventType: "RECOVERY_SCORED", label: "Recovery Scored" },
  { eventType: "INTERVENTION_SELECTED", label: "Intervention Selected" },
  { eventType: "POLICY_EVALUATED", label: "Policy Evaluated" },
  { eventType: "ACTION_SIMULATED", label: "Action Simulated" },
];

function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}

export default function RecoveryCaseDetail() {
  const { id } = useParams();
  const [recoveryCase, setRecoveryCase] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState(null);
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false);

  function load() {
    setError(null);
    Promise.all([api.getRecoveryCase(id), api.getRecoveryCaseAudit(id)])
      .then(([caseRes, auditRes]) => {
        setRecoveryCase(caseRes.recoveryCase);
        setAuditLog(auditRes.auditLog);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleEvaluate() {
    setBusy(true);
    setActionError(null);
    try {
      await api.evaluateRecoveryCase(id);
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateAction() {
    setBusy(true);
    setActionError(null);
    try {
      await api.simulateRecoveryAction(id);
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Day 6 — real Razorpay Test Mode Payment Link, kept as a SEPARATE control from "Simulate
  // Action" above so it's never ambiguous which one made a live external API call.
  async function handleCreatePaymentLink() {
    setPaymentLinkBusy(true);
    setPaymentLinkError(null);
    try {
      await api.createPaymentLink(id);
      load();
    } catch (err) {
      setPaymentLinkError(err.message);
    } finally {
      setPaymentLinkBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600">Could not load this recovery case: {error}</p>;
  }

  if (!recoveryCase || !auditLog) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  const canEvaluate = ["RISK_DETECTED", "ANALYZING", "FAILED"].includes(recoveryCase.status);
  const canSimulateAction = recoveryCase.status === "POLICY_APPROVED";
  const canStartVoice = ["RISK_DETECTED", "ANALYZING", "FAILED", "ELIGIBLE"].includes(recoveryCase.status);

  const completedEventTypes = new Set(auditLog.map((e) => e.eventType));

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-mono text-slate-400">{recoveryCase._id}</div>
        <h1 className="text-xl font-semibold text-slate-900">Recovery Case</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Amount at Risk" value={formatINR(recoveryCase.amount)} />
          <Field label="Status" value={recoveryCase.status} />
          <Field label="Root Cause" value={recoveryCase.rootCause} />
          <Field
            label="Recovery Probability"
            value={recoveryCase.recoveryProbability != null ? `${Math.round(recoveryCase.recoveryProbability * 100)}%` : null}
          />
          <Field label="Policy Decision (Reason Code)" value={recoveryCase.policyDecision} />
          <Field label="Selected Intervention" value={recoveryCase.selectedIntervention} />
          <Field label="Attempts" value={`${recoveryCase.attempts}`} />
          <Field label="Recovered Amount" value={formatINR(recoveryCase.recoveredAmount)} />
          {recoveryCase.razorpayPaymentLinkShortUrl && (
            <Field
              label="Razorpay Payment Link (Test Mode)"
              value={
                <a
                  href={recoveryCase.razorpayPaymentLinkShortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-900 underline hover:no-underline"
                >
                  {recoveryCase.razorpayPaymentLinkShortUrl}
                </a>
              }
            />
          )}
        </dl>
        {recoveryCase.reasonCodes?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {recoveryCase.reasonCodes.map((code) => (
              <span key={code} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {code}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={handleEvaluate}
            disabled={busy || !canEvaluate}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Working…" : "Evaluate"}
          </button>
          <button
            type="button"
            onClick={handleSimulateAction}
            disabled={busy || !canSimulateAction}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="No real Razorpay call — resolves the outcome with a seeded RNG"
          >
            {busy ? "Working…" : "Simulate Action"}
          </button>
          {canSimulateAction && recoveryCase.selectedIntervention === "CREATE_PAYMENT_LINK" && (
            <button
              type="button"
              onClick={handleCreatePaymentLink}
              disabled={paymentLinkBusy || !canSimulateAction}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="Makes a real Razorpay Test Mode API call"
            >
              {paymentLinkBusy ? "Creating…" : "Create Payment Link — Razorpay Test Mode"}
            </button>
          )}
          {canStartVoice && (
            <Link
              to={`/voice-recovery/${recoveryCase._id}`}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Start Voice Recovery
            </Link>
          )}
          {!canEvaluate && !canSimulateAction && !canStartVoice && (
            <span className="text-xs text-slate-400">
              This case is in a terminal or in-flight state — no further action available.
            </span>
          )}
          {actionError && <span className="text-xs text-red-600">{actionError}</span>}
          {paymentLinkError && <span className="text-xs text-red-600">{paymentLinkError}</span>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Explainable Timeline</h2>
        <ol className="space-y-3">
          {TIMELINE_STEPS.map((step) => {
            const entry = auditLog.find((e) => e.eventType === step.eventType);
            const done = completedEventTypes.has(step.eventType);
            return (
              <li key={step.eventType} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    done ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                />
                <div>
                  <div className={`text-sm font-medium ${done ? "text-slate-900" : "text-slate-400"}`}>
                    {step.label}
                  </div>
                  {entry && (
                    <div className="text-xs text-slate-500">
                      {entry.result && <span>result: {entry.result}</span>}
                      {entry.reason && <span> · reason: {entry.reason}</span>}
                      <span> · {new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Full Audit Trail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4 font-medium">Time</th>
                <th className="pb-2 pr-4 font-medium">Event</th>
                <th className="pb-2 pr-4 font-medium">Reason</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-4 text-slate-500">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700">{entry.eventType}</td>
                  <td className="py-2 pr-4 text-slate-600">{entry.reason || "—"}</td>
                  <td className="py-2 text-slate-600">{entry.result || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
