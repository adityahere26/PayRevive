import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { statusLabel } from "../lib/statusMeta.js";
import { Card } from "../components/ui/Card.jsx";
import { StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { InboxIcon, RefreshIcon } from "../components/ui/icons.jsx";

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
    <div className="space-y-6">
      <PageHeader
        title="Recovery Cases"
        description="Revenue-at-risk cases with root cause, policy decision, and recommended intervention."
        actions={
          <button type="button" onClick={load} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <RefreshIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ml-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || "ALL"} value={s}>
                {s ? statusLabel(s) : "All"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">{total} case{total === 1 ? "" : "s"}</span>
      </div>

      {error && (
        <Alert tone="danger" title="Could not reach the API" action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {!cases && !error && (
        <Card>
          <div className="space-y-2">
            <SkeletonBlock className="h-9" />
            <SkeletonBlock className="h-9" />
            <SkeletonBlock className="h-9" />
            <SkeletonBlock className="h-9" />
          </div>
        </Card>
      )}

      {cases && cases.length === 0 && !error && (
        <EmptyState
          icon={<InboxIcon className="h-5 w-5" />}
          title="No recovery cases match this filter"
          description='Use "Simulate Payment Failure" on the Dashboard to create one.'
        />
      )}

      {cases && cases.length > 0 && (
        <Card bodyClassName="-mx-6 -mb-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-2 font-medium">Case ID</th>
                <th className="px-6 py-2 font-medium">Amount</th>
                <th className="px-6 py-2 font-medium">Root Cause</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Policy Decision</th>
                <th className="px-6 py-2 font-medium">Intervention</th>
                <th className="px-6 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c._id} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-mint-50/60">
                  <td className="px-6 py-3">
                    <Link to={`/recovery-cases/${c._id}`} className="font-mono text-xs text-slate-600 hover:text-brand-700 hover:underline">
                      {c._id}
                    </Link>
                  </td>
                  <td className="px-6 py-3 font-semibold text-brand-900">{formatINR(c.amount)}</td>
                  <td className="px-6 py-3 text-slate-500">{humanize(c.rootCause) || "—"}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-6 py-3 text-slate-500">{humanize(c.policyDecision) || "—"}</td>
                  <td className="px-6 py-3 text-slate-500">{humanize(c.selectedIntervention) || "—"}</td>
                  <td className="px-6 py-3 text-slate-400" title={new Date(c.createdAt).toLocaleString()}>
                    {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
