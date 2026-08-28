import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { statusLabel, STATUS_ACCENT_CLASS } from "../lib/statusMeta.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { Field } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { ArrowLeftIcon } from "../components/ui/icons.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";

// CLAUDE.md § Day 3 § 14 Recovery Case Detail — "This page is extremely important for the
// eventual judge demo because it makes every money action explainable." Shows the case's
// current decision state plus the full audit trail rendered as a timeline.

// The approval-gated recovery chain (ARCHITECTURE.md § Recovery plans). Steps that haven't
// happened yet render as "Pending" — e.g. everything from "Recovery Plan Confirmed" onward
// stays pending until the merchant confirms the plan, and the last two until a verified
// Razorpay Test Mode webhook arrives. ACTION_SIMULATED is the equivalent for the no-Razorpay
// simulated path.
const TIMELINE_STEPS = [
  { eventType: "REVENUE_RISK_DETECTED", label: "Payment Failed — Revenue Risk Detected" },
  { eventType: "ROOT_CAUSE_IDENTIFIED", label: "Root Cause Identified" },
  { eventType: "ELIGIBILITY_EVALUATED", label: "Eligibility Checked" },
  { eventType: "POLICY_EVALUATED", label: "Policy Decision" },
  { eventType: "RECOVERY_PLAN_CREATED", label: "Recovery Plan Created" },
  { eventTypes: ["RECOVERY_PLAN_APPROVED"], label: "Recovery Plan Confirmed by Merchant" },
  { eventTypes: ["PAYMENT_LINK_CREATED", "ACTION_SIMULATED"], label: "Recovery Action Executed" },
  { eventType: "RAZORPAY_WEBHOOK_VERIFIED", label: "Payment Outcome Verified" },
  { eventTypes: ["PAYMENT_RECOVERY_SUCCEEDED"], label: "Payment Recovery Succeeded" },
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
  const recoveredEntry =
    recoveryCase.status === "RECOVERED"
      ? auditLog.find((e) => e.eventType === "PAYMENT_RECOVERY_SUCCEEDED") ||
        auditLog.find((e) => e.eventType === "ACTION_SIMULATED")
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/recovery-cases" className="inline-flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-900">
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Recovery Cases
        </Link>
      </div>

      {/* CASE HERO — a case study, not an admin record */}
      <RevealOnScroll>
        <Card className="relative overflow-hidden">
          <div className={`absolute inset-x-0 top-0 h-1 ${STATUS_ACCENT_CLASS[recoveryCase.status] || "bg-brand-200"}`} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="label-mono text-[11px] text-brand-400">RECOVERY CASE</span>
                {isRecovered && (
                  <Badge tone={isRazorpayRecovery ? "brand" : "slate"} size="sm">
                    {isRazorpayRecovery ? "Razorpay Test Mode" : "Simulated"}
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 font-mono text-xs text-brand-400">{recoveryCase._id}</div>
            </div>
            <StatusBadge status={recoveryCase.status} size="lg" />
          </div>

          <div className="mt-8 flex flex-col gap-6 border-t border-brand-900/8 pt-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="label-mono text-[11px] text-brand-400">
                {isRecovered ? "RECOVERED AMOUNT" : "AMOUNT AT RISK"}
              </div>
              <div
                className={`mt-2 text-6xl font-bold leading-none tracking-tight sm:text-7xl ${
                  isRecovered ? "text-emerald-600" : "text-brand-950"
                }`}
              >
                {formatINR(isRecovered ? recoveryCase.recoveredAmount : recoveryCase.amount)}
              </div>
              <div className="mt-3 label-mono text-xs tracking-[0.2em] text-brand-400">
                {statusLabel(recoveryCase.status).toUpperCase()}
              </div>
              {isRecovered && (
                <div className="mt-1.5 text-xs text-brand-400">of {formatINR(recoveryCase.amount)} originally at risk</div>
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
      </RevealOnScroll>

      {/* RAZORPAY PAYMENT LINK STATE */}
      {recoveryCase.razorpayPaymentLinkShortUrl && (
        <RevealOnScroll delay={60}>
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
        </RevealOnScroll>
      )}

      {/* DECISION SUMMARY */}
      <RevealOnScroll delay={100}>
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
            {recoveredEntry && (
              <Field label="Recovered On" value={new Date(recoveredEntry.timestamp).toLocaleString()} />
            )}
          </dl>
          {recoveryCase.reasonCodes?.length > 0 && (
            <div className="mt-6 border-t border-brand-900/8 pt-5">
              <div className="label-mono text-[11px] text-brand-400">SCORING FACTORS</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recoveryCase.reasonCodes.map((code) => (
                  <Badge key={code} tone="slate">{humanize(code)}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </RevealOnScroll>

      {/* ACTION AREA */}
      <RevealOnScroll delay={140}>
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
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-mint-50 px-4 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-mint-100 disabled:cursor-not-allowed disabled:opacity-50"
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
              <span className="text-xs text-brand-400">
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
      </RevealOnScroll>

      {/* RECOVERY TIMELINE — the decision trail, told as a story */}
      <RevealOnScroll delay={180}>
        <Card title="The Decision Trail">
          <ol className="relative">
            {TIMELINE_STEPS.map((step, idx) => {
              const keys = step.eventTypes || [step.eventType];
              const entry = auditLog.find((e) => keys.includes(e.eventType));
              const done = keys.some((k) => completedEventTypes.has(k));
              const isLast = idx === TIMELINE_STEPS.length - 1;
              return (
                <li key={step.label} className="relative flex gap-5 pb-8 last:pb-0">
                  {!isLast && (
                    <div
                      className={`absolute left-[15px] top-8 h-full w-px ${done ? "bg-emerald-200" : "bg-brand-900/8"}`}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className={`label-mono relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] ring-4 ring-white ${
                      done ? "bg-emerald-500 text-white" : "bg-brand-100 text-brand-400"
                    }`}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className={`text-base font-semibold ${done ? "text-brand-950" : "text-brand-300"}`}>{step.label}</div>
                    {entry ? (
                      <div className="mt-1 text-xs text-brand-500">
                        {entry.result && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-600">{entry.result}</span>
                        )}
                        {entry.reason && <span className="ml-1.5">{entry.reason}</span>}
                        <span className="ml-1.5 text-brand-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-brand-300">Pending</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </RevealOnScroll>

      {/* AUDIT TRAIL */}
      <RevealOnScroll delay={220}>
        <Card title="Full Audit Trail">
          {/* Desktop */}
          <div className="-mx-6 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-900/10">
                  <th className="label-mono px-6 pb-2 text-[11px] font-normal text-brand-400">TIME</th>
                  <th className="label-mono px-6 pb-2 text-[11px] font-normal text-brand-400">EVENT</th>
                  <th className="label-mono px-6 pb-2 text-[11px] font-normal text-brand-400">REASON</th>
                  <th className="label-mono px-6 pb-2 text-[11px] font-normal text-brand-400">RESULT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-900/8">
                {auditLog.map((entry) => (
                  <tr key={entry._id} className="transition-colors hover:bg-brand-50">
                    <td className="whitespace-nowrap px-6 py-2.5 text-brand-500">{new Date(entry.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-2.5 font-mono text-xs text-brand-700">{entry.eventType}</td>
                    <td className="px-6 py-2.5 text-brand-500">{entry.reason || "—"}</td>
                    <td className="px-6 py-2.5 text-brand-500">{entry.result || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="-mx-6 -mb-2 divide-y divide-brand-900/8 sm:hidden">
            {auditLog.map((entry) => (
              <div key={entry._id} className="px-6 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-brand-700">{entry.eventType}</span>
                  <span className="text-[11px] text-brand-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="mt-1 text-xs text-brand-500">{entry.reason || "—"}</div>
                {entry.result && <div className="mt-1 font-mono text-[11px] text-brand-600">{entry.result}</div>}
              </div>
            ))}
          </div>
        </Card>
      </RevealOnScroll>
    </div>
  );
}
