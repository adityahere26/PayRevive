import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { STATUS_ACCENT_CLASS } from "../lib/statusMeta.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { Field } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { ArrowLeftIcon } from "../components/ui/icons.jsx";

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
    return (
      <Alert tone="danger" title="Could not load this recovery case" action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}>
        {error}
      </Alert>
    );
  }

  if (!recoveryCase || !auditLog) {
    return (
      <div className="space-y-6">
        <Card>
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="mt-3 h-8 w-56" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="h-10" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const canEvaluate = ["RISK_DETECTED", "ANALYZING", "FAILED"].includes(recoveryCase.status);
  const canSimulateAction = recoveryCase.status === "POLICY_APPROVED";
  const canStartVoice = ["RISK_DETECTED", "ANALYZING", "FAILED", "ELIGIBLE"].includes(recoveryCase.status);
  const isRecovered = recoveryCase.status === "RECOVERED";
  const isRazorpayRecovery = Boolean(recoveryCase.razorpayPaymentLinkId);

  const completedEventTypes = new Set(auditLog.map((e) => e.eventType));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/recovery-cases" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700">
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Recovery Cases
        </Link>
      </div>

      {/* CASE HEADER */}
      <Card className="relative overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-1 ${STATUS_ACCENT_CLASS[recoveryCase.status] || "bg-slate-200"}`} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-brand-900">Recovery Case</h1>
              <StatusBadge status={recoveryCase.status} size="lg" />
              {isRecovered && (
                <Badge tone={isRazorpayRecovery ? "brand" : "slate"} size="sm">
                  {isRazorpayRecovery ? "Razorpay Test Mode" : "Simulated"}
                </Badge>
              )}
            </div>
            <div className="mt-1.5 font-mono text-xs text-slate-400">{recoveryCase._id}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {isRecovered ? "Recovered Amount" : "Amount at Risk"}
            </div>
            <div className={`mt-1 text-3xl font-bold leading-none tracking-tight ${isRecovered ? "text-emerald-600" : "text-brand-900"}`}>
              {formatINR(isRecovered ? recoveryCase.recoveredAmount : recoveryCase.amount)}
            </div>
            {isRecovered && (
              <div className="mt-1.5 text-xs text-slate-400">of {formatINR(recoveryCase.amount)} originally at risk</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {recoveryCase.rootCause && <Badge tone="slate">Root cause: {humanize(recoveryCase.rootCause)}</Badge>}
            {recoveryCase.recoveryProbability != null && (
              <Badge tone="cyan">{Math.round(recoveryCase.recoveryProbability * 100)}% recovery probability</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* RAZORPAY PAYMENT LINK STATE */}
      {recoveryCase.razorpayPaymentLinkShortUrl && (
        <Card tone="mint">
          <div className="flex items-center gap-2">
            <Badge tone="brand">Razorpay Test Mode</Badge>
            <span className="text-xs text-brand-700/80">A real Razorpay Test Mode Payment Link was created for this case</span>
          </div>
          <a
            href={recoveryCase.razorpayPaymentLinkShortUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 block break-all font-mono text-sm font-medium text-brand-800 underline underline-offset-2 hover:text-brand-900"
          >
            {recoveryCase.razorpayPaymentLinkShortUrl}
          </a>
        </Card>
      )}

      {/* DECISION SUMMARY */}
      <Card title="Decision Summary">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          <Field
            label="Policy Decision"
            value={humanize(recoveryCase.policyDecision)}
            caption={recoveryCase.policyDecision ? `reason code: ${recoveryCase.policyDecision}` : null}
          />
          <Field label="Selected Intervention" value={humanize(recoveryCase.selectedIntervention)} />
          <Field
            label="Recovery Probability"
            value={recoveryCase.recoveryProbability != null ? `${Math.round(recoveryCase.recoveryProbability * 100)}%` : null}
          />
          <Field label="Attempts" value={`${recoveryCase.attempts}`} />
          <Field label="Recovered Amount" value={formatINR(recoveryCase.recoveredAmount)} />
        </dl>
        {recoveryCase.reasonCodes?.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Scoring Factors</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recoveryCase.reasonCodes.map((code) => (
                <Badge key={code} tone="slate">{humanize(code)}</Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ACTION AREA */}
      <Card title="Actions">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleEvaluate} disabled={busy || !canEvaluate}>
            {busy ? "Working…" : "Evaluate"}
          </Button>
          <button
            type="button"
            onClick={handleSimulateAction}
            disabled={busy || !canSimulateAction}
            title="No real Razorpay call — resolves the outcome with a seeded RNG"
            className={buttonClasses({ variant: "secondary" })}
          >
            {busy ? "Working…" : "Simulate Action"}
            <Badge tone="slate" size="sm">demo</Badge>
          </button>
          {canSimulateAction && recoveryCase.selectedIntervention === "CREATE_PAYMENT_LINK" && (
            <button
              type="button"
              onClick={handleCreatePaymentLink}
              disabled={paymentLinkBusy || !canSimulateAction}
              title="Makes a real Razorpay Test Mode API call"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-mint-50 px-4 py-2 text-sm font-medium text-brand-800 shadow-sm transition-colors hover:bg-mint-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paymentLinkBusy ? "Creating…" : "Create Payment Link"}
              <Badge tone="brand" size="sm">Razorpay Test Mode</Badge>
            </button>
          )}
          {canStartVoice && (
            <Link to={`/voice-recovery/${recoveryCase._id}`} className={buttonClasses({ variant: "secondary" })}>
              Start Voice Recovery
            </Link>
          )}
          {!canEvaluate && !canSimulateAction && !canStartVoice && (
            <span className="text-xs text-slate-400">
              This case is in a terminal or in-flight state — no further action available.
            </span>
          )}
        </div>

        {actionError && (
          <div className="mt-4">
            <Alert tone="danger">{actionError}</Alert>
          </div>
        )}
        {paymentLinkError && (
          <div className="mt-4">
            <Alert tone="warning" title="Razorpay Test Mode unavailable">{paymentLinkError}</Alert>
          </div>
        )}
      </Card>

      {/* RECOVERY TIMELINE */}
      <Card title="Explainable Timeline">
        <ol className="relative">
          {TIMELINE_STEPS.map((step, idx) => {
            const entry = auditLog.find((e) => e.eventType === step.eventType);
            const done = completedEventTypes.has(step.eventType);
            const isLast = idx === TIMELINE_STEPS.length - 1;
            return (
              <li key={step.eventType} className="relative flex gap-3 pb-6 last:pb-0">
                {!isLast && (
                  <div className={`absolute left-[5px] top-3 h-full w-px ${done ? "bg-brand-200" : "bg-slate-100"}`} aria-hidden="true" />
                )}
                <div className={`relative mt-1 h-[11px] w-[11px] flex-shrink-0 rounded-full ring-4 ring-white ${done ? "bg-emerald-500" : "bg-slate-200"}`} />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${done ? "text-brand-900" : "text-slate-400"}`}>{step.label}</div>
                  {entry ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {entry.result && (
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{entry.result}</span>
                      )}
                      {entry.reason && <span className="ml-1.5">{entry.reason}</span>}
                      <span className="ml-1.5 text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-slate-300">Pending</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* AUDIT TRAIL */}
      <Card title="Full Audit Trail">
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 pb-2 font-medium">Time</th>
                <th className="px-6 pb-2 font-medium">Event</th>
                <th className="px-6 pb-2 font-medium">Reason</th>
                <th className="px-6 pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry._id} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-mint-50/60">
                  <td className="whitespace-nowrap px-6 py-2.5 text-slate-500">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-2.5 font-mono text-xs text-slate-700">{entry.eventType}</td>
                  <td className="px-6 py-2.5 text-slate-500">{entry.reason || "—"}</td>
                  <td className="px-6 py-2.5 text-slate-500">{entry.result || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
