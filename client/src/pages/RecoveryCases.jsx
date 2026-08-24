import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";

// ARCHITECTURE.md § API contract — GET /api/recovery-cases. CLAUDE.md § Day 3 § 13.

const STATUS_FILTERS = [
  "",
  "RISK_DETECTED",
  "ANALYZING",
  "ELIGIBLE",
  "ACTION_SELECTED",
  "POLICY_APPROVED",
  "ACTION_EXECUTED",
  "WAITING_OUTCOME",
  "RECOVERED",
  "FAILED",
  "STOPPED",
  "ESCALATED",
  "EXPIRED",
];

function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

export default function RecoveryCases() {
  const [cases, setCases] = useState(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    api
      .listRecoveryCases(status ? { status } : {})
      .then((res) => {
        setCases(res.cases);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Recovery Cases</h1>
          <p className="mt-1 text-sm text-slate-600">
            Revenue-at-risk cases with root cause, policy decision, and recommended intervention.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || "ALL"} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">{total} case{total === 1 ? "" : "s"}</span>
      </div>

      {error && <p className="text-sm text-red-600">Could not reach the API: {error}</p>}

      {cases && cases.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No recovery cases match this filter. Use "Simulate Payment Failure" on the Dashboard to create one.
        </div>
      )}

      {cases && cases.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Case ID</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Root Cause</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Policy Decision</th>
                <th className="px-4 py-2 font-medium">Intervention</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/recovery-cases/${c._id}`} className="font-mono text-xs text-slate-700 hover:underline">
                      {c._id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatINR(c.amount)}</td>
                  <td className="px-4 py-2 text-slate-600">{c.rootCause || "—"}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.policyDecision || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{c.selectedIntervention || "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
