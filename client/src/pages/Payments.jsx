import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { statusLabel, statusTone } from "../lib/statusMeta.js";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { PhoneIcon, LinkIcon, UsersIcon, CheckCircleIcon, InboxIcon, AlertTriangleIcon } from "../components/ui/icons.jsx";
import { Eyebrow } from "../components/marketing/Eyebrow.jsx";

// New business-owner primary surface: "Show me all my payment activity and immediately help
// me recover failed payments." Every number and row comes from GET /api/dashboard/payments-
// overview (server/src/routes/dashboard.js) — merchant-scoped, never fabricated. The two bulk
// actions reuse the exact same recovery-case APIs the rest of the product already uses
// (Evaluate -> Payment Link, and the existing single-session Voice Recovery page) — see the
// notes on each flow below for why neither invents new backend behavior.

const EVALUABLE_STATUSES = ["RISK_DETECTED", "ANALYZING", "FAILED"];
const VOICE_ELIGIBLE_STATUSES = ["RISK_DETECTED", "ANALYZING", "FAILED", "ELIGIBLE"];
// A case in any other status still has a live path to recovery (including POLICY_APPROVED /
// WAITING_OUTCOME — the merchant just took an action and it hasn't resolved yet). Only these
// four are dead ends for the existing recovery tools on this page.
const NOT_RECOVERABLE_STATUSES = ["RECOVERED", "ESCALATED", "STOPPED", "EXPIRED"];

// Dot-plus-word status treatment — same tone semantics as the app-wide StatusBadge
// (lib/statusMeta.js) but without pill chrome, so a list of many rows reads as an editorial
// list rather than a table full of badges.
const DOT_TONE = {
  mint: { dot: "bg-emerald-500", text: "text-emerald-700" },
  amber: { dot: "bg-amber-500", text: "text-amber-700" },
  red: { dot: "bg-red-500", text: "text-red-700" },
  cyan: { dot: "bg-cyan-500", text: "text-cyan-700" },
  slate: { dot: "bg-slate-300", text: "text-slate-500" },
  brand: { dot: "bg-brand-500", text: "text-brand-700" },
};

function StatusIndicator({ status, size = "md" }) {
  const meta = DOT_TONE[statusTone(status)] || DOT_TONE.slate;
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${meta.text} ${size === "sm" ? "text-xs" : "text-sm"}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      {statusLabel(status)}
    </span>
  );
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

// What the merchant can do next, folded into a quiet caption line rather than a second pill —
// only shown when there's something concrete to say.
function interventionHint(recoveryCase) {
  if (!recoveryCase) return null;
  if (recoveryCase.selectedIntervention) return `Recommended: ${humanize(recoveryCase.selectedIntervention)}`;
  if (EVALUABLE_STATUSES.includes(recoveryCase.status)) return "Not yet evaluated";
  return null;
}
const CURRENCY_MOTIFS = [
  { symbol: "₹", className: "text-brand-300/70 text-4xl", style: { top: "8%", left: "3%" } },
  { symbol: "₹", className: "text-mint-300/60 text-2xl", style: { bottom: "12%", right: "6%" } },
  { symbol: "$", className: "text-slate-300/50 text-xl", style: { top: "58%", left: "12%" } },
  { symbol: "€", className: "text-slate-300/40 text-lg", style: { top: "20%", right: "18%" } },
  { symbol: "£", className: "text-slate-300/40 text-lg", style: { bottom: "22%", left: "22%" } },
];

const EMPTY_ARRAY = [];

function CurrencyMotifs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {CURRENCY_MOTIFS.map((m, i) => (
        <span
          key={i}
          className={`absolute font-semibold select-none ${m.className}`}
          style={m.style}
        >
          {m.symbol}
        </span>
      ))}
    </div>
  );
}

// Decorative floating chips — only ever built from real recovered cases already present in
// the failed-payments list (a recovered case's original Payment record stays `status: failed`
// forever; recovery happens via a separate payment/link, not by mutating history — see
// pipeline/tools.js). No fabricated customer, amount, or review data; if nothing has been
// recovered yet, this renders nothing rather than invent a data point.
function FloatingRecoveryChip({ row, style, delay }) {
  return (
    <div
      className="group pointer-events-auto absolute hidden lg:block"
      style={{ ...style, animation: `payrevive-float 7s ease-in-out ${delay}s infinite` }}
    >
      <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white/95 px-3.5 py-2 shadow-card backdrop-blur-sm">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircleIcon className="h-3 w-3" />
        </span>
        <span className="text-xs font-semibold text-brand-900">{formatINR(row.recoveryCase.recoveredAmount || row.amount)}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">Recovered</span>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-52 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left opacity-0 shadow-card-hover transition-opacity duration-150 group-hover:opacity-100">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Customer</div>
        <div className="text-sm font-semibold text-brand-900">{row.customerName}</div>
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Amount</div>
        <div className="text-sm text-slate-700">{formatINR(row.recoveryCase.recoveredAmount || row.amount)}</div>
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Status</div>
        <StatusBadge status={row.recoveryCase.status} size="sm" />
      </div>
    </div>
  );
}

function OverviewHero({ overview, loading, error, onRetry }) {
  const total = overview?.totalClients ?? 0;
  const passed = overview?.paymentsPassed ?? 0;
  const failed = overview?.paymentsFailed ?? 0;
  const passedPct = total > 0 ? Math.round((passed / (passed + failed || 1)) * 100) : null;

  const recoveredHighlights = useMemo(
    () => (overview?.failedPayments || []).filter((r) => r.recoveryCase?.status === "RECOVERED").slice(0, 3),
    [overview]
  );
  // Kept well clear of the hero's own overflow-hidden edge (min 10% inset) and staggered
  // horizontally so a second/third chip's hover tooltip never lands under the one before it.
  const chipPositions = [
    { top: "10%", right: "10%" },
    { top: "42%", right: "32%" },
    { bottom: "12%", right: "16%" },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-brand-900/10 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 px-6 py-10 shadow-card-hover sm:px-10 sm:py-14">
      <CurrencyMotifs />
      {recoveredHighlights.map((row, i) => (
        <FloatingRecoveryChip key={row.paymentId} row={row} style={chipPositions[i]} delay={i * 1.3} />
      ))}

      <div className="relative max-w-2xl">
        <Eyebrow tone="dark">Revenue recovery console</Eyebrow>
        <h1 className="mt-4 text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl">
          See what went through.
          <br />
          Recover what didn't.
        </h1>
        <p className="mt-4 max-w-md text-base text-mint-100/90 sm:text-lg">
          Monitor every payment. Recover the ones that don't go through.
        </p>
      </div>

      {error && (
        <div className="relative mt-8">
          <Alert tone="danger" title="Could not reach the API" action={<Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}>
            {error}
          </Alert>
        </div>
      )}

      {loading && !error && (
        <div className="relative mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl bg-white/10 p-5">
              <SkeletonBlock className="h-3 w-20 bg-white/20" />
              <SkeletonBlock className="mt-3 h-9 w-16 bg-white/20" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && overview && (
        <div className="relative mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-[1.2fr_1px_1fr]">
          <div>
            <div className="flex items-center gap-2 text-mint-200">
              <UsersIcon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total Clients</span>
            </div>
            <div className="mt-2 text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl">{total}</div>
            <div className="mt-2 text-sm text-mint-100/80">customers with payment activity on record</div>
          </div>

          <div className="hidden bg-white/15 sm:block" />

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-mint-200">Payments Passed</div>
              <div className="mt-1.5 text-3xl font-bold tracking-tight text-white">{passed}</div>
              {passedPct !== null && <div className="mt-1 text-xs text-mint-100/70">{passedPct}% of recent volume</div>}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-amber-300">Payments Failed</div>
              <div className="mt-1.5 text-3xl font-bold tracking-tight text-white">{failed}</div>
              <div className="mt-1 text-xs text-mint-100/70">need recovery attention</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Desktop/tablet row — a spacious editorial list row, not a table cell: one avatar, one
// typographic block (name + why-it-failed-and-when caption), amount, and a dot-status with an
// optional one-line "what next" hint. No grid lines, no second pill.
function FailedPaymentRow({ row, selected, selectable, onToggle }) {
  const rc = row.recoveryCase;
  const hint = interventionHint(rc);
  return (
    <div
      className={`flex items-center gap-4 border-b border-slate-100 px-6 py-5 transition-colors last:border-0 hover:bg-mint-50/50 ${selected ? "bg-mint-50/70" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={!selectable}
        onChange={() => onToggle(rc.id)}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-400 disabled:opacity-30"
      />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
        {initials(row.customerName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold text-brand-900">{row.customerName || "Unknown customer"}</div>
        <div className="mt-0.5 truncate text-xs text-slate-400">
          {humanize(row.failureReason) || "Unknown reason"}
          <span className="mx-1.5 text-slate-300">·</span>
          <span title={new Date(row.createdAt).toLocaleString()}>
            {new Date(row.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
          {row.customerOptedOut && <span className="ml-1.5 text-amber-600">· Opted out of contact</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular-nums text-brand-900">{formatINR(row.amount)}</div>
      </div>
      <div className="hidden w-48 shrink-0 text-right sm:block">
        {rc ? <StatusIndicator status={rc.status} /> : <span className="text-sm text-slate-300">No case</span>}
        {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

// Mobile card — same visual language as the row above (avatar, dot-status, one hint line)
// rather than a shrunken table row.
function FailedPaymentCard({ row, selected, selectable, onToggle }) {
  const rc = row.recoveryCase;
  const hint = interventionHint(rc);
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${selected ? "border-brand-200 bg-mint-50/60" : "border-slate-200/80 bg-white"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={!selectable}
          onChange={() => onToggle(rc.id)}
          className="mt-3 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-400 disabled:opacity-30"
        />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
          {initials(row.customerName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-brand-900">{row.customerName || "Unknown customer"}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {humanize(row.failureReason) || "Unknown reason"}
                <span className="mx-1 text-slate-300">·</span>
                {new Date(row.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm font-bold tabular-nums text-brand-900">{formatINR(row.amount)}</div>
          </div>
          <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5">
            {rc ? <StatusIndicator status={rc.status} size="sm" /> : <span className="text-xs text-slate-300">No case</span>}
            {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectionSummary({ rows }) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
        <div className="text-sm font-medium text-brand-900">
          {rows.length} customer{rows.length === 1 ? "" : "s"} selected
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight text-brand-950">{formatINR(total)}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">total at risk</div>
        </div>
      </div>
      <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50/80 p-3">
        {rows.map((r) => (
          <div key={r.paymentId} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">{r.customerName || "Unknown customer"}</span>
            <span className="font-medium text-brand-900">{formatINR(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// CALL AGENT FLOW — reuses the existing single-session Hinglish Voice Recovery implementation
// (routes/voice.js, client/src/pages/VoiceRecovery.jsx) rather than inventing an automated
// outbound dialer. Architecture limitation, stated plainly rather than faked: this build has
// no telephony/queue backend capable of placing multiple real calls at once — a voice
// "session" is a live interactive conversation (browser mic <-> Gemini) that only exists while
// a person is on the line. What this panel adds is a UI orchestration layer: it queues the
// selected customers and lets the operator step through each one's real session in turn,
// polling each case's real status from the API as it changes.
function CallAgentFlow({ rows, step, onCancel, onStart, liveStatuses }) {
  if (step === "confirm") {
    return (
      <Card tone="mint" title="Start AI voice recovery" subtitle="Review the selection, then confirm to begin.">
        <SelectionSummary rows={rows} />
        <div className="mt-4">
          <Alert tone="info">PayRevive will attempt AI voice recovery for the selected customers.</Alert>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={onStart} className="uppercase tracking-wide">Confirm Calls</Button>
          <button type="button" onClick={onCancel} className={buttonClasses({ variant: "tertiary" })}>Cancel</button>
        </div>
      </Card>
    );
  }

  return (
    <Card tone="mint" title="AI call queue" subtitle="One live session at a time — this is the same voice pipeline used elsewhere in the product.">
      <Alert tone="warning" title="Backend limitation">
        PayRevive doesn't yet have an automated outbound-calling backend. Each call below opens
        the real Voice Recovery session for that customer in a new tab — start them one at a
        time (or work through several tabs in parallel), and this queue will reflect each
        case's real status as it updates.
      </Alert>
      <div className="mt-4 space-y-2">
        {rows.map((r) => {
          const live = liveStatuses[r.recoveryCase.id] || r.recoveryCase;
          const eligible = VOICE_ELIGIBLE_STATUSES.includes(live.status) && !r.customerOptedOut;
          return (
            <div key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-medium text-brand-900">{r.customerName || "Unknown customer"}</div>
                <div className="text-xs text-slate-400">{formatINR(r.amount)}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status={live.status} size="sm" />
                {eligible ? (
                  <Link
                    to={`/voice-recovery/${r.recoveryCase.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    <PhoneIcon className="h-3.5 w-3.5" />
                    Start call
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Not eligible for a new session</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5">
        <button type="button" onClick={onCancel} className={buttonClasses({ variant: "tertiary" })}>Close queue</button>
      </div>
    </Card>
  );
}

const LINK_OUTCOME_META = {
  sent: { label: "Link sent", tone: "mint", icon: CheckCircleIcon },
  already_recovered: { label: "Already recovered", tone: "mint", icon: CheckCircleIcon },
  blocked: { label: "Blocked by policy", tone: "amber", icon: AlertTriangleIcon },
  error: { label: "Error", tone: "red", icon: AlertTriangleIcon },
};

// SEND PAYMENT LINKS FLOW — every request goes through the existing, already-safe payment-
// link path (POST /api/recovery-cases/:id/evaluate then POST /:id/payment-link, exactly what
// RecoveryCaseDetail.jsx's own controls call). No second Razorpay integration, no bypassing
// the Policy Engine: a case the engine doesn't approve for CREATE_PAYMENT_LINK is reported as
// "Blocked by policy" here, never forced.
function SendLinksFlow({ rows, step, results, processing, onCancel, onSend }) {
  if (step === "confirm") {
    return (
      <Card tone="mint" title="Send Razorpay Test Mode payment links" subtitle="Review the selection, then send.">
        <SelectionSummary rows={rows} />
        <div className="mt-4">
          <Alert tone="info">
            PayRevive will run each selected case through the recovery policy engine and create
            a Razorpay Test Mode payment link only where it's approved.
          </Alert>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={onSend}>Send Payment Links</Button>
          <button type="button" onClick={onCancel} className={buttonClasses({ variant: "tertiary" })}>Cancel</button>
        </div>
      </Card>
    );
  }

  return (
    <Card tone="mint" title={processing ? "Sending payment links…" : "Payment link results"} subtitle="Razorpay Test Mode">
      <div className="space-y-2">
        {rows.map((r) => {
          const result = results.find((res) => res.caseId === r.recoveryCase.id);
          const meta = result ? LINK_OUTCOME_META[result.outcome] : null;
          const Icon = meta?.icon;
          return (
            <div key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-medium text-brand-900">{r.customerName || "Unknown customer"}</div>
                <div className="text-xs text-slate-400">{formatINR(r.amount)}</div>
              </div>
              {!result && processing && <span className="text-xs text-slate-400">Working…</span>}
              {result && (
                <div className="flex items-center gap-2">
                  <Badge tone={meta.tone} size="sm">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                  {result.detail && <span className="text-xs text-slate-400">{humanize(result.detail)}</span>}
                  {result.shortUrl && (
                    <a href={result.shortUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 underline hover:text-brand-900">
                      Open link
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!processing && (
        <div className="mt-5">
          <button type="button" onClick={onCancel} className={buttonClasses({ variant: "tertiary" })}>Close</button>
        </div>
      )}
    </Card>
  );
}

export default function Payments() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const [flow, setFlow] = useState(null); // "call" | "link" | null
  const [flowStep, setFlowStep] = useState("confirm");
  const [flowRows, setFlowRows] = useState([]);
  const [linkResults, setLinkResults] = useState([]);
  const [linkProcessing, setLinkProcessing] = useState(false);
  const [callStatuses, setCallStatuses] = useState({});

  const load = useCallback(() => {
    setError(null);
    api
      .paymentsOverview()
      .then(setOverview)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const failedPayments = overview?.failedPayments || EMPTY_ARRAY;
  const selectableRows = useMemo(() => failedPayments.filter((r) => r.recoveryCase), [failedPayments]);
  const { amountAtRisk, recoverableCount } = useMemo(() => {
    let amount = 0;
    let recoverable = 0;
    for (const r of failedPayments) {
      const status = r.recoveryCase?.status;
      if (status === "RECOVERED") continue;
      amount += r.amount;
      if (r.recoveryCase && !NOT_RECOVERABLE_STATUSES.includes(status)) recoverable += 1;
    }
    return { amountAtRisk: amount, recoverableCount: recoverable };
  }, [failedPayments]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.recoveryCase.id));
  const selectedRows = useMemo(
    () => selectableRows.filter((r) => selected.has(r.recoveryCase.id)),
    [selectableRows, selected]
  );

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.recoveryCase.id)));
  }
  function toggleRow(caseId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }

  function openFlow(type) {
    setFlow(type);
    setFlowStep("confirm");
    setFlowRows(selectedRows);
    setLinkResults([]);
    setCallStatuses({});
  }
  function closeFlow() {
    setFlow(null);
    setFlowStep("confirm");
    setLinkProcessing(false);
  }
  function startCallQueue() {
    setFlowStep("queue");
  }
  async function sendLinks() {
    setFlowStep("progress");
    setLinkProcessing(true);
    const results = [];
    for (const row of flowRows) {
      const caseId = row.recoveryCase.id;
      let current = row.recoveryCase;
      try {
        if (EVALUABLE_STATUSES.includes(current.status)) {
          const evalRes = await api.evaluateRecoveryCase(caseId);
          current = evalRes.recoveryCase;
        }
        if (current.status === "RECOVERED") {
          results.push({ caseId, outcome: "already_recovered" });
        } else if (current.status === "POLICY_APPROVED" && current.selectedIntervention === "CREATE_PAYMENT_LINK") {
          const linkRes = await api.createPaymentLink(caseId);
          results.push({ caseId, outcome: "sent", shortUrl: linkRes.paymentLink.shortUrl });
        } else {
          results.push({ caseId, outcome: "blocked", detail: current.policyDecision || current.status });
        }
      } catch (err) {
        results.push({ caseId, outcome: "error", detail: err.message });
      }
      setLinkResults([...results]);
    }
    setLinkProcessing(false);
    setFlowStep("done");
    load();
  }

  // Live-poll each queued case's real status while the call queue is open — never a fabricated
  // "in progress" animation, only what the API actually reports.
  useEffect(() => {
    if (flow !== "call" || flowStep !== "queue" || flowRows.length === 0) return undefined;
    let cancelled = false;
    async function poll() {
      const entries = await Promise.all(
        flowRows.map(async (r) => {
          try {
            const res = await api.getRecoveryCase(r.recoveryCase.id);
            return [r.recoveryCase.id, res.recoveryCase];
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setCallStatuses((prev) => {
        const next = { ...prev };
        for (const entry of entries) if (entry) next[entry[0]] = entry[1];
        return next;
      });
    }
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [flow, flowStep, flowRows]);

  return (
    <div className="space-y-8">
      <style>{`@keyframes payrevive-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }`}</style>

      <OverviewHero overview={overview} loading={!overview && !error} error={error} onRetry={load} />

      <div className="relative overflow-hidden rounded-3xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <Eyebrow>Recovery queue</Eyebrow>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">Failed Payments</h2>
            <p className="mt-1.5 max-w-xl text-sm text-slate-500">
              These customers may require recovery — select one or more to start an AI voice
              call or send a Razorpay Test Mode payment link.
            </p>
          </div>
          {overview && failedPayments.length > 0 && (
            <div className="flex items-baseline gap-8">
              <div>
                <div className="text-3xl font-bold tracking-tight text-brand-900">{formatINR(amountAtRisk)}</div>
                <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">at risk</div>
              </div>
              <div>
                <div className="text-3xl font-bold tracking-tight text-emerald-600">{recoverableCount}</div>
                <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">recoverable now</div>
              </div>
            </div>
          )}
        </div>

        {!overview && !error && (
          <Card>
            <div className="space-y-2">
              <SkeletonBlock className="h-9" />
              <SkeletonBlock className="h-9" />
              <SkeletonBlock className="h-9" />
            </div>
          </Card>
        )}

        {overview && failedPayments.length === 0 && (
          <EmptyState
            icon={<InboxIcon className="h-5 w-5" />}
            title="No failed payments"
            description="Every tracked payment for this merchant has gone through cleanly so far."
          />
        )}

        {overview && failedPayments.length > 0 && (
          <Card bodyClassName="-mx-6 -mb-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 pb-4">
              <label className="flex items-center gap-2 text-sm font-medium text-brand-900">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableRows.length === 0}
                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-400"
                />
                Select all
                <span className="font-normal text-slate-400">
                  {selected.size > 0 ? `· ${selected.size} selected` : ""}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openFlow("call")}
                  disabled={selected.size === 0}
                  className={buttonClasses({ variant: "secondary", size: "sm", className: "uppercase tracking-wide" })}
                >
                  <PhoneIcon className="h-3.5 w-3.5" />
                  Call Agent
                </button>
                <button
                  type="button"
                  onClick={() => openFlow("link")}
                  disabled={selected.size === 0}
                  className={buttonClasses({ size: "sm", className: "uppercase tracking-wide" })}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Send Payment Links
                </button>
              </div>
            </div>

            {/* Editorial list — sm and up. Deliberately not a <table>: one spacious row per
                customer (avatar, name + why/when caption, amount, dot-status) instead of a
                dense grid of cells and badges. */}
            <div className="hidden sm:block">
              {failedPayments.map((row) => (
                <FailedPaymentRow
                  key={row.paymentId}
                  row={row}
                  selectable={Boolean(row.recoveryCase)}
                  selected={row.recoveryCase ? selected.has(row.recoveryCase.id) : false}
                  onToggle={toggleRow}
                />
              ))}
            </div>

            {/* Stacked cards — below sm */}
            <div className="space-y-3 px-6 pb-4 sm:hidden">
              {failedPayments.map((row) => (
                <FailedPaymentCard
                  key={row.paymentId}
                  row={row}
                  selectable={Boolean(row.recoveryCase)}
                  selected={row.recoveryCase ? selected.has(row.recoveryCase.id) : false}
                  onToggle={toggleRow}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {flow === "call" && (
        <CallAgentFlow rows={flowRows} step={flowStep} onCancel={closeFlow} onStart={startCallQueue} liveStatuses={callStatuses} />
      )}
      {flow === "link" && (
        <SendLinksFlow
          rows={flowRows}
          step={flowStep === "confirm" ? "confirm" : "progress"}
          results={linkResults}
          processing={linkProcessing}
          onCancel={closeFlow}
          onSend={sendLinks}
        />
      )}
    </div>
  );
}
