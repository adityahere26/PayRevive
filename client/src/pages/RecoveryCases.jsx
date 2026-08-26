import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { statusLabel } from "../lib/statusMeta.js";
import { StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { Card } from "../components/ui/Card.jsx";
import { InboxIcon, RefreshIcon } from "../components/ui/icons.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";

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
    <div className="space-y-8">
      <RevealOnScroll>
        <PageHeader
          eyebrow={
            <span className="label-mono inline-flex items-center gap-2 text-[11px] text-brand-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              RECOVERY CASES
            </span>
          }
          title="Every case, one decision trail."
          description="Revenue-at-risk cases with root cause, policy decision, and recommended intervention."
          actions={
            <button type="button" onClick={load} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <RefreshIcon className="h-3.5 w-3.5" />
              Refresh
            </button>
          }
        />
      </RevealOnScroll>

      <RevealOnScroll delay={80}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-900/8 pb-5">
          <label className="flex items-center gap-2.5 text-sm text-brand-600">
            <span className="label-mono text-[11px] text-brand-400">STATUS</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-sm text-brand-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/25"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s || "ALL"} value={s}>
                  {s ? statusLabel(s) : "All"}
                </option>
              ))}
            </select>
          </label>
          <span className="label-mono text-[11px] text-brand-400">
            {total} CASE{total === 1 ? "" : "S"}
          </span>
        </div>
      </RevealOnScroll>

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
        <RevealOnScroll delay={140}>
          {/* Desktop — premium hairline list, not a boxed spreadsheet */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-900/10">
                  <th className="label-mono py-3 pr-6 text-[11px] font-normal text-brand-400">CASE ID</th>
                  <th className="label-mono px-6 py-3 text-[11px] font-normal text-brand-400">AMOUNT</th>
                  <th className="label-mono px-6 py-3 text-[11px] font-normal text-brand-400">ROOT CAUSE</th>
                  <th className="label-mono px-6 py-3 text-[11px] font-normal text-brand-400">STATUS</th>
                  <th className="label-mono px-6 py-3 text-[11px] font-normal text-brand-400">POLICY DECISION</th>
                  <th className="label-mono px-6 py-3 text-[11px] font-normal text-brand-400">INTERVENTION</th>
                  <th className="label-mono py-3 pl-6 text-[11px] font-normal text-brand-400">CREATED</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-900/8">
                {cases.map((c) => (
                  <tr key={c._id} className="transition-colors hover:bg-emerald-50/50">
                    <td className="py-4 pr-6">
                      <Link to={`/recovery-cases/${c._id}`} className="font-mono text-xs text-brand-500 hover:text-brand-950 hover:underline">
                        {c._id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-base font-semibold text-brand-950">{formatINR(c.amount)}</td>
                    <td className="px-6 py-4 text-brand-500">{humanize(c.rootCause) || "—"}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-4 text-brand-500">{humanize(c.policyDecision) || "—"}</td>
                    <td className="px-6 py-4 text-brand-500">{humanize(c.selectedIntervention) || "—"}</td>
                    <td className="py-4 pl-6 text-brand-400" title={new Date(c.createdAt).toLocaleString()}>
                      {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards, not a squeezed table */}
          <div className="divide-y divide-brand-900/8 sm:hidden">
            {cases.map((c) => (
              <Link
                key={c._id}
                to={`/recovery-cases/${c._id}`}
                className="block py-4 transition-colors hover:bg-emerald-50/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg font-semibold text-brand-950">{formatINR(c.amount)}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-400">
                  <span className="font-mono">{c._id}</span>
                  <span>{humanize(c.rootCause) || "—"}</span>
                  <span>{new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </div>
              </Link>
            ))}
          </div>
        </RevealOnScroll>
      )}
    </div>
  );
}
