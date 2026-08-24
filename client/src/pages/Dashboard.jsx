import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";

// CLAUDE.md § Day 3 objective, § 12 Frontend — real dashboard metrics backed by
// GET /api/dashboard/summary, plus a "Simulate Payment Failure" control that drives
// POST /api/demo/payment-failure. DEMO/TEST ONLY — never a real payment (see routes/demo.js).

const FAILURE_REASONS = [
  { value: "insufficient_funds", label: "Insufficient funds (retryable)" },
  { value: "authentication_failed", label: "Authentication failed (retryable)" },
  { value: "card_expired", label: "Card expired (payment method issue)" },
  { value: "bank_declined", label: "Bank declined (non-retryable)" },
  { value: "customer_cancelled", label: "Customer cancelled (declined)" },
];

function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const STATUS_STYLES = {
  RECOVERED: "bg-emerald-50 text-emerald-700",
  ESCALATED: "bg-amber-50 text-amber-700",
  STOPPED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-50 text-red-700",
  POLICY_APPROVED: "bg-blue-50 text-blue-700",
};

function StatusBadge({ status }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
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
    api.dashboardSummary().then(setSummary).catch((err) => setError(err.message));
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Revenue-at-risk and recovery metrics for the authenticated merchant.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {formOpen ? "Close" : "Simulate Payment Failure"}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSimulate}
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Demo / Test Only — never a real payment
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Customer name
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Customer email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Failure reason
              <select
                value={form.failureReason}
                onChange={(e) => setForm((f) => ({ ...f, failureReason: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                {FAILURE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.optedOut}
                onChange={(e) => setForm((f) => ({ ...f, optedOut: e.target.checked }))}
              />
              Customer has opted out of contact
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Simulating…" : "Trigger Failed Payment"}
            </button>
            {submitError && <span className="text-xs text-red-600">{submitError}</span>}
          </div>

          {lastCreated && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              Created recovery case{" "}
              <Link to={`/recovery-cases/${lastCreated._id}`} className="font-medium text-slate-900 underline">
                {lastCreated._id}
              </Link>{" "}
              — {formatINR(lastCreated.amount)}, status {lastCreated.status}. Evaluate it from the
              Recovery Cases page to run it through the pipeline.
            </div>
          )}
        </form>
      )}

      {error && <p className="text-sm text-red-600">Could not reach the API: {error}</p>}

      {!summary && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Revenue at Risk" value={formatINR(summary.revenueAtRisk)} hint={`${summary.totalCases} cases`} />
            <StatTile label="Recovery Cases" value={summary.totalCases} />
            <StatTile
              label="Recovered Revenue"
              value={formatINR(summary.recoveredRevenue)}
              hint={`${summary.recoveredCases} recovered`}
            />
            <StatTile label="Cases Requiring Review" value={summary.casesRequiringReview} hint="Escalated (high-value)" />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">Recent Recovery Cases</h2>
              <Link to="/recovery-cases" className="text-xs text-slate-500 hover:text-slate-700">
                View all →
              </Link>
            </div>
            {summary.recentCases.length === 0 ? (
              <p className="text-sm text-slate-400">
                No recovery cases yet — use "Simulate Payment Failure" above to create one.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 font-medium">Case</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentCases.map((c) => (
                    <tr key={c._id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2">
                        <Link to={`/recovery-cases/${c._id}`} className="font-mono text-xs text-slate-700 hover:underline">
                          {c._id}
                        </Link>
                      </td>
                      <td className="py-2">{formatINR(c.amount)}</td>
                      <td className="py-2">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="py-2 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
