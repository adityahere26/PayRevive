import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, formatRelativeTime } from "../lib/format.js";
import { Card } from "../components/ui/Card.jsx";
import { StatTile } from "../components/ui/StatTile.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock, SkeletonStatRow } from "../components/ui/Skeleton.jsx";
import { MagnitudeBar } from "../components/ui/MagnitudeBar.jsx";
import { TrendingUpIcon, InboxIcon } from "../components/ui/icons.jsx";

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
      <PageHeader
        title="Dashboard"
        description="Revenue-at-risk and recovery metrics for the authenticated merchant."
        actions={
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
            className={buttonClasses({ variant: "secondary" })}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${formOpen ? "bg-slate-400" : "bg-amber-500"}`} aria-hidden="true" />
            {formOpen ? "Close simulator" : "Simulate Payment Failure"}
          </button>
        }
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

      {error && (
        <Alert tone="danger" title="Could not reach the API" action={
          <Button variant="secondary" size="sm" onClick={loadSummary}>Retry</Button>
        }>
          {error}
        </Alert>
      )}

      {!summary && !error && (
        <>
          <SkeletonStatRow />
          <Card>
            <SkeletonBlock className="h-4 w-40" />
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-8" />
              <SkeletonBlock className="h-8" />
              <SkeletonBlock className="h-8" />
            </div>
          </Card>
        </>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              label="Revenue at Risk"
              value={formatINR(summary.revenueAtRisk)}
              hint={`${summary.totalCases} case${summary.totalCases === 1 ? "" : "s"} total`}
              accent="amber"
            />
            <StatTile
              label="Recovered Revenue"
              value={formatINR(summary.recoveredRevenue)}
              hint={`${summary.recoveredCases} recovered`}
              accent="emerald"
              icon={<TrendingUpIcon className="h-4 w-4" />}
            />
            <StatTile
              label="Recovery Rate"
              value={recoveryRate === null ? "—" : `${recoveryRate}%`}
              hint="Recovered ÷ total cases"
              accent="brand"
            />
            <StatTile label="Requires Review" value={summary.casesRequiringReview} hint="Escalated (high-value)" accent="slate" />
          </div>

          {summary.totalCases > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

              <Card title="Recovery by Intervention" subtitle="Revenue share and recovery rate for each intervention the policy engine actually approved.">
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
            action={
              <Link to="/recovery-cases" className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-800">
                View all →
              </Link>
            }
          >
            {summary.recentCases.length === 0 ? (
              <EmptyState
                icon={<InboxIcon className="h-5 w-5" />}
                title="No recovery cases yet"
                description='Use "Simulate Payment Failure" above to create one.'
              />
            ) : (
              <div className="-mx-6 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-6 py-2 font-medium">Case</th>
                      <th className="px-6 py-2 font-medium">Amount</th>
                      <th className="px-6 py-2 font-medium">Status</th>
                      <th className="px-6 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentCases.map((c) => (
                      <tr key={c._id} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-mint-50/60">
                        <td className="px-6 py-3">
                          <Link to={`/recovery-cases/${c._id}`} className="font-mono text-xs text-slate-600 hover:text-brand-700 hover:underline">
                            {c._id}
                          </Link>
                        </td>
                        <td className="px-6 py-3 font-semibold text-brand-900">{formatINR(c.amount)}</td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={c.status} />
                            <RecoverySourceBadge recoveryCase={c} />
                          </div>
                        </td>
                        <td className="px-6 py-3 text-slate-500" title={new Date(c.createdAt).toLocaleString()}>
                          {formatRelativeTime(c.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
