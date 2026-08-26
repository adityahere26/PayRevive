import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, formatRelativeTime } from "../lib/format.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { MagnitudeBar } from "../components/ui/MagnitudeBar.jsx";
import { InboxIcon } from "../components/ui/icons.jsx";
import { Eyebrow } from "../components/marketing/Eyebrow.jsx";

// CLAUDE.md § Day 3 objective, § 12 Frontend — real dashboard metrics backed by
// GET /api/dashboard/summary, plus a "Simulate Payment Failure" control that drives
// POST /api/demo/payment-failure. DEMO/TEST ONLY — never a real payment (see routes/demo.js).
//
// Every number below comes straight from GET /api/dashboard/summary's aggregation over the
// merchant's own RecoveryCase documents — no historical/time-series data is fabricated (the
// backend has none to draw one from honestly), and Evaluation's synthetic runs can never leak
// in here since the batch evaluator never persists a RecoveryCase document (evaluation/
// batchEvaluator.js).

const INTERVENTION_LABELS = {
  CREATE_PAYMENT_LINK: "Payment Link",
  START_VOICE_RECOVERY: "Voice Recovery",
  RECORD_PROMISE_TO_PAY: "Promise to Pay",
  STOP: "Stop (no contact)",
};

// Terminal/near-terminal statuses shown as their own row; everything else (RISK_DETECTED
// through WAITING_OUTCOME) is summed into one "In Progress" row — a categorical breakdown,
// not a fabricated trend line.
const OUTCOME_ROWS = [
  { key: "RECOVERED", label: "Recovered", tone: "emerald" },
  { key: "FAILED", label: "Failed", tone: "red" },
  { key: "ESCALATED", label: "Escalated", tone: "amber" },
  { key: "STOPPED", label: "Stopped", tone: "slate" },
  { key: "EXPIRED", label: "Expired", tone: "slate" },
];
const IN_PROGRESS_STATUSES = [
  "RISK_DETECTED",
  "ANALYZING",
  "ELIGIBLE",
  "ACTION_SELECTED",
  "POLICY_APPROVED",
  "ACTION_EXECUTED",
  "WAITING_OUTCOME",
];

const FAILURE_REASONS = [
  { value: "insufficient_funds", label: "Insufficient funds (retryable)" },
  { value: "authentication_failed", label: "Authentication failed (retryable)" },
  { value: "card_expired", label: "Card expired (payment method issue)" },
  { value: "bank_declined", label: "Bank declined (non-retryable)" },
  { value: "customer_cancelled", label: "Customer cancelled (declined)" },
];

// A RECOVERED case is either a real Razorpay Test Mode payment (a Payment Link was actually
// created and paid) or a demo-only outcome from "Simulate Action" on the case detail page —
// see RecoveryCaseDetail.jsx. razorpayPaymentLinkId is only ever set by the real Test Mode
// path (routes/recoveryCases.js), so its presence is what distinguishes the two here.
function RecoverySourceBadge({ recoveryCase }) {
  if (recoveryCase.status !== "RECOVERED") return null;
  const isTestMode = Boolean(recoveryCase.razorpayPaymentLinkId);
  return (
    <Badge
      tone={isTestMode ? "brand" : "slate"}
      size="sm"
      className="uppercase tracking-wide"
    >
      {isTestMode ? "Razorpay Test Mode" : "Simulated"}
    </Badge>
  );
}

// Editorial hero band — same dark-gradient/asymmetric-metric language as Payments' OverviewHero
// (client/src/pages/Payments.jsx), so the two primary product surfaces read as one system.
// "Revenue at Risk" leads as the large hero number (the problem the whole product exists to
// address); Recovered Revenue / Recovery Rate / Failed Payments run as the secondary row —
// mirroring Payments' Total Clients + Passed/Failed split.
function DashboardHero({ summary, recoveryRate, error, onRetry, formOpen, onToggleForm }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-brand-900/10 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 px-6 py-10 shadow-card-hover sm:px-10 sm:py-14">
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <Eyebrow tone="dark">Recovery overview</Eyebrow>
          <h1 className="mt-4 text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl">Dashboard</h1>
          <p className="mt-4 max-w-md text-base text-mint-100/90 sm:text-lg">
            Where revenue is at risk, and what's being done about it.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleForm}
          aria-expanded={formOpen}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-white transition-colors hover:bg-white/20"
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${formOpen ? "bg-white/50" : "bg-amber-400"}`} aria-hidden="true" />
          {formOpen ? "Close simulator" : "Simulate Payment Failure"}
        </button>
      </div>

      {error && (
        <div className="relative mt-8">
          <Alert tone="danger" title="Could not reach the API" action={<Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}>
            {error}
          </Alert>
        </div>
      )}

      {!summary && !error && (
        <div className="relative mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-white/10 p-5">
              <SkeletonBlock className="h-3 w-20 bg-white/20" />
              <SkeletonBlock className="mt-3 h-9 w-16 bg-white/20" />
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="relative mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-[1.2fr_1px_1fr]">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-amber-300">Revenue at Risk</div>
            <div className="mt-2 text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl">
              {formatINR(summary.revenueAtRisk)}
            </div>
            <div className="mt-2 text-sm text-mint-100/80">
              {summary.totalCases} case{summary.totalCases === 1 ? "" : "s"} total
            </div>
          </div>

          <div className="hidden bg-white/15 sm:block" />

          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-mint-200">Recovered</div>
              <div className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">{formatINR(summary.recoveredRevenue)}</div>
              <div className="mt-1 text-xs text-mint-100/70">{summary.recoveredCases} recovered</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-mint-200">Recovery Rate</div>
              <div className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {recoveryRate === null ? "—" : `${recoveryRate}%`}
              </div>
              <div className="mt-1 text-xs text-mint-100/70">recovered ÷ total</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-amber-300">Failed Payments</div>
              <div className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {summary.statusBreakdown?.FAILED || 0}
              </div>
              <div className="mt-1 text-xs text-mint-100/70">{summary.casesRequiringReview} escalated</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    name: "Priya Sharma",
    email: "priya@example.com",
    amount: "2999",
    failureReason: "insufficient_funds",
    optedOut: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [lastCreated, setLastCreated] = useState(null);

  const loadSummary = useCallback(() => {
    api
      .dashboardSummary()
      .then((data) => {
        setSummary(data);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function handleSimulate(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { recoveryCase } = await api.simulatePaymentFailure({
        customer: { name: form.name, email: form.email, optedOut: form.optedOut },
        amount: Number(form.amount),
        currency: "INR",
        failureReason: form.failureReason,
      });
      setLastCreated(recoveryCase);
      loadSummary();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const recoveryRate =
    summary && summary.totalCases > 0 ? Math.round((summary.recoveredCases / summary.totalCases) * 100) : null;

  return (
    <div className="space-y-8">
      <DashboardHero
        summary={summary}
        recoveryRate={recoveryRate}
        error={error}
        onRetry={loadSummary}
        formOpen={formOpen}
        onToggleForm={() => setFormOpen((v) => !v)}
      />

      {formOpen && (
        <Card>
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="text-sm font-semibold text-brand-900">Demo control — synthetic failed payment</div>
              <div className="mt-0.5 text-xs text-slate-400">
                Creates a recovery case in the pipeline. Never touches a real payment or a real customer.
              </div>
            </div>
            <Badge tone="amber">Test data only</Badge>
          </div>
          <form onSubmit={handleSimulate}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Customer name
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </label>
              <label className="text-sm text-slate-600">
                Customer email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </label>
              <label className="text-sm text-slate-600">
                Amount (₹)
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </label>
              <label className="text-sm text-slate-600">
                Failure reason
                <select
                  value={form.failureReason}
                  onChange={(e) => setForm((f) => ({ ...f, failureReason: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {FAILURE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.optedOut}
                  onChange={(e) => setForm((f) => ({ ...f, optedOut: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-400"
                />
                Customer has opted out of contact
              </label>
            </div>

            <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-5">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Simulating…" : "Trigger Failed Payment"}
              </Button>
              {submitError && <span className="text-xs text-red-600">{submitError}</span>}
            </div>
          </form>

          {lastCreated && (
            <Alert tone="success" title="Recovery case created">
              <Link to={`/recovery-cases/${lastCreated._id}`} className="font-medium underline underline-offset-2">
                {lastCreated._id}
              </Link>{" "}
              — {formatINR(lastCreated.amount)}, status {lastCreated.status}. Evaluate it from the Recovery Cases
              page to run it through the pipeline.
            </Alert>
          )}
        </Card>
      )}

      {!summary && !error && (
        <Card>
          <SkeletonBlock className="h-4 w-40" />
          <div className="mt-4 space-y-2">
            <SkeletonBlock className="h-8" />
            <SkeletonBlock className="h-8" />
            <SkeletonBlock className="h-8" />
          </div>
        </Card>
      )}

      {summary && (
        <>
          {summary.totalCases > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
              <Card title="Recovery Performance" subtitle="Every case, by current outcome — a snapshot, not a trend (no historical data to draw one from honestly).">
                <div className="space-y-4">
                  {(() => {
                    const inProgressCount = IN_PROGRESS_STATUSES.reduce((sum, s) => sum + (summary.statusBreakdown[s] || 0), 0);
                    const inProgressRevenue = IN_PROGRESS_STATUSES.reduce((sum, s) => sum + (summary.revenueByStatus?.[s] || 0), 0);
                    const rows = [
                      ...OUTCOME_ROWS.map((r) => ({
                        ...r,
                        count: summary.statusBreakdown[r.key] || 0,
                        revenue: summary.revenueByStatus?.[r.key] || 0,
                      })),
                      { key: "IN_PROGRESS", label: "In Progress", tone: "brand", count: inProgressCount, revenue: inProgressRevenue },
                    ];
                    return rows.map((r) => (
                      <MagnitudeBar
                        key={r.key}
                        title={r.label}
                        tone={r.tone}
                        value={`${r.count} case${r.count === 1 ? "" : "s"}`}
                        hint={r.revenue > 0 ? formatINR(r.revenue) : null}
                        widthPct={(r.count / summary.totalCases) * 100}
                      />
                    ));
                  })()}
                </div>
              </Card>

              <Card tone="mint" title="Recovery by Intervention" subtitle="Revenue share and recovery rate for each intervention the policy engine actually approved.">
                {Object.keys(summary.interventionBreakdown || {}).length === 0 ? (
                  <EmptyState title="No intervention selected yet" description="Evaluate a recovery case to see interventions here." />
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const maxRevenue = Math.max(1, ...Object.values(summary.interventionBreakdown).map((g) => g.revenue));
                      return Object.entries(summary.interventionBreakdown).map(([key, group]) => (
                        <MagnitudeBar
                          key={key}
                          title={INTERVENTION_LABELS[key] || key}
                          tone="brand"
                          value={`${group.count} case${group.count === 1 ? "" : "s"} · ${formatINR(group.revenue)}`}
                          hint={group.recoveredRevenue > 0 ? `${Math.round(group.recoveryRate * 100)}% recovered` : null}
                          widthPct={(group.revenue / maxRevenue) * 100}
                        />
                      ));
                    })()}
                  </div>
                )}
              </Card>
            </div>
          )}

          <Card
            title="Recent Recovery Cases"
            bodyClassName="-mx-6 -mb-2"
            action={
              <Link to="/recovery-cases" className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-800">
                View all →
              </Link>
            }
          >
            {summary.recentCases.length === 0 ? (
              <div className="px-6">
                <EmptyState
                  icon={<InboxIcon className="h-5 w-5" />}
                  title="No recovery cases yet"
                  description='Use "Simulate Payment Failure" above to create one.'
                />
              </div>
            ) : (
              summary.recentCases.map((c) => (
                <div
                  key={c._id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 transition-colors last:border-0 hover:bg-mint-50/50"
                >
                  <Link to={`/recovery-cases/${c._id}`} className="font-mono text-xs text-slate-500 hover:text-brand-700 hover:underline">
                    {c._id}
                  </Link>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm font-semibold text-brand-900">{formatINR(c.amount)}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={c.status} />
                      <RecoverySourceBadge recoveryCase={c} />
                    </div>
                    <span className="text-xs text-slate-400" title={new Date(c.createdAt).toLocaleString()}>
                      {formatRelativeTime(c.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
