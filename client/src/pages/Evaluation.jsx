import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { statusLabel } from "../lib/statusMeta.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { StatTile } from "../components/ui/StatTile.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock, SkeletonStatRow } from "../components/ui/Skeleton.jsx";
import { SparkleIcon } from "../components/ui/icons.jsx";
import { MagnitudeBar } from "../components/ui/MagnitudeBar.jsx";

// EVALUATION.md § Batch evaluation engine — runs the real recovery pipeline against a
// seeded synthetic dataset (evaluation/batchEvaluator.js), never Gemini, never Razorpay,
// never a real voice session. Every number on this page comes from POST/GET /api/evaluation
// (server/src/routes/evaluation.js) — nothing here is fabricated client-side.

const STATUS_FILTERS = ["", "RECOVERED", "ESCALATED", "STOPPED", "EXPIRED", "FAILED"];

const INTERVENTION_LABELS = {
  CREATE_PAYMENT_LINK: "Payment Link",
  START_VOICE_RECOVERY: "Voice Recovery",
  RECORD_PROMISE_TO_PAY: "Promise to Pay",
  STOP: "Stop (no contact)",
  NONE: "No action reached",
};

// A revenue-shaped group ({count, revenue, recoveredRevenue, recoveryRate}) into MagnitudeBar
// props, scaled against the largest group in the same breakdown.
function revenueBarProps(group, maxRevenue) {
  return {
    value: `${group.count} case${group.count === 1 ? "" : "s"} · ${formatINR(group.revenue)}`,
    hint: group.recoveredRevenue > 0 ? `${Math.round(group.recoveryRate * 100)}% recovered` : null,
    widthPct: maxRevenue > 0 ? (group.revenue / maxRevenue) * 100 : 0,
  };
}

export default function Evaluation() {
  const [run, setRun] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [count, setCount] = useState("100");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadLatest() {
      setLoadingInitial(true);
      setLoadError(null);
      try {
        const { evaluationRuns } = await api.listEvaluationRuns();
        if (!cancelled && evaluationRuns.length > 0) {
          const { evaluationRun } = await api.getEvaluationRun(evaluationRuns[0]._id);
          if (!cancelled) setRun(evaluationRun);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    }
    loadLatest();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRun(e) {
    e.preventDefault();
    setRunning(true);
    setRunError(null);
    try {
      const { evaluationRun } = await api.runEvaluation(Number(count));
      setRun(evaluationRun);
      setStatusFilter("");
    } catch (err) {
      setRunError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const metrics = run?.metrics;
  const cases = metrics?.cases || [];
  const visibleCases = statusFilter ? cases.filter((c) => c.status === statusFilter) : cases;
  const maxGroupRevenue = metrics
    ? Math.max(1, ...Object.values(metrics.recoveryByIntervention || {}).map((g) => g.revenue))
    : 1;
  const maxArchetypeRevenue = metrics
    ? Math.max(1, ...Object.values(metrics.archetypeBreakdown || {}).map((g) => g.revenue))
    : 1;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={<span className="label-mono text-xs font-medium text-slate-400">EVALUATION</span>}
        title="Measure the recovery engine."
        badge={<Badge tone="mint" size="lg">Synthetic Data</Badge>}
        description={
          <>
            Runs PayRevive's real recovery pipeline — root cause, scoring, policy, and execution — against a
            seeded batch of synthetic cases. It runs entirely in-memory: no real Razorpay Test Mode payments,
            no external service calls, and never presented as actual merchant revenue. This is the{" "}
            <strong>synthetic batch evaluation</strong> — for the live demo merchant's actual measured
            recovered revenue, see the <strong>Dashboard</strong>.
          </>
        }
      />

      <Card
        title="Run Evaluation"
        subtitle="Generates a fresh deterministic dataset and runs it through the production pipeline in-memory."
      >
        <form onSubmit={handleRun} className="flex flex-wrap items-end gap-4">
          <label className="label-mono block text-[11px] text-slate-500">
            Number of synthetic cases
            <input
              type="number"
              min="20"
              max="500"
              step="10"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="mt-2 block w-36 rounded-lg border border-slate-200 px-3 py-1.5 font-sans text-sm normal-case tracking-normal text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </label>
          <Button type="submit" disabled={running}>
            {running ? "Running evaluation…" : "Run Evaluation"}
          </Button>
          {run && !running && (
            <span className="text-xs text-slate-400">
              Last run: {new Date(run.createdAt).toLocaleString()} · seed {run.seed}
            </span>
          )}
        </form>
        {runError && (
          <div className="mt-3">
            <Alert tone="danger">{runError}</Alert>
          </div>
        )}
      </Card>

      {loadError && (
        <Alert tone="danger" title="Could not load previous evaluation runs">{loadError}</Alert>
      )}

      {loadingInitial && !run && (
        <Card>
          <SkeletonBlock className="h-3 w-40" />
          <div className="mt-4">
            <SkeletonStatRow />
          </div>
        </Card>
      )}

      {!loadingInitial && !run && !loadError && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-brand-900/15 bg-white/60 px-6 py-16 text-center">
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-mint-100 text-brand-600">
            <SparkleIcon className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-brand-900">No evaluation has been run yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Click "Run Evaluation" above to generate a synthetic batch and measure recovery rate, policy
            behavior, and revenue outcomes across the real pipeline — no fabricated numbers shown until a run
            actually completes.
          </p>
        </div>
      )}

      {metrics && (
        <>
          <Alert tone="info" title="Synthetic Data — Evaluation Batch">
            These {metrics.totalCases} cases and all figures below were generated in-memory for this run only.
            They are never written to the live Recovery Cases / Dashboard views and never represent real
            Razorpay Test Mode activity.
          </Alert>

          {/* Headline metrics — the five concepts this page exists to answer: how much of the
              revenue at risk actually came back, how hard the policy engine pumped the brakes,
              and where a human had to step in. */}
          <div>
            <div className="label-mono mb-4 text-[11px] text-slate-400">Recovery Outcome</div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <StatTile label="Recovery Rate" value={`${Math.round(metrics.recoveryRate * 100)}%`} hint="of eligible revenue" accent="brand" />
              <StatTile label="Recovered Amount" value={formatINR(metrics.recoveredRevenue)} hint={`${metrics.recoveredCases} of ${metrics.totalCases} cases`} accent="emerald" />
              <StatTile label="Policy Violations" value={metrics.policyViolations} hint={metrics.policyViolations === 0 ? "0 — as expected" : "unexpected — investigate"} accent={metrics.policyViolations === 0 ? "emerald" : "red"} />
              <StatTile label="Escalations" value={metrics.escalatedCases} hint={`${formatINR(metrics.escalatedRevenue)} sent for human review`} accent="amber" />
            </div>
          </div>

          <div>
            <div className="label-mono mb-4 text-[11px] text-slate-400">Pipeline Detail</div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <StatTile label="Cases Evaluated" value={metrics.totalCases} hint={`₹ ${metrics.totalRevenueAtRisk.toLocaleString("en-IN")} at risk`} accent="slate" />
              <StatTile label="Policy Approved" value={metrics.approvedCases} hint="reached POLICY_APPROVED" accent="brand" />
              <StatTile label="Actions Executed" value={metrics.actionsExecuted} hint="non-stop actions" accent="slate" />
              <StatTile label="Stopped / Expired" value={metrics.stoppedCases + metrics.expiredCases} hint={`${formatINR(metrics.stoppedRevenue + metrics.expiredRevenue)} left untouched`} accent="slate" />
            </div>
          </div>

          <Card
            title="Intervention Effectiveness"
            subtitle="Revenue share and recovery rate for each intervention the policy engine actually approved."
          >
            <div className="space-y-4">
              {Object.entries(metrics.recoveryByIntervention || {}).map(([key, group]) => (
                <MagnitudeBar key={key} title={INTERVENTION_LABELS[key] || humanize(key)} {...revenueBarProps(group, maxGroupRevenue)} />
              ))}
            </div>
          </Card>

          <Card title="Breakdown by Archetype" subtitle="How each synthetic case archetype (EVALUATION.md § Synthetic dataset) fared once run through the real pipeline.">
            <div className="space-y-4">
              {Object.entries(metrics.archetypeBreakdown || {}).map(([key, group]) => (
                <MagnitudeBar key={key} title={group.label} {...revenueBarProps(group, maxArchetypeRevenue)} />
              ))}
            </div>
          </Card>

          <Card
            title="Synthetic Case Results"
            subtitle={`${visibleCases.length} of ${cases.length} cases shown`}
            action={
              <label className="label-mono text-[11px] text-slate-500">
                Outcome
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="ml-2 rounded-lg border border-slate-200 px-2 py-1 font-sans text-xs normal-case tracking-normal shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {STATUS_FILTERS.map((s) => (
                    <option key={s || "ALL"} value={s}>
                      {s ? statusLabel(s) : "All"}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            <div className="-mx-6 max-h-[520px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="label-mono border-b border-brand-900/10 text-[10px] text-slate-400">
                    <th className="px-6 pb-3 font-medium">Case</th>
                    <th className="px-6 pb-3 font-medium">Amount</th>
                    <th className="px-6 pb-3 font-medium">Root Cause</th>
                    <th className="px-6 pb-3 font-medium">Probability</th>
                    <th className="px-6 pb-3 font-medium">Intervention</th>
                    <th className="px-6 pb-3 font-medium">Policy Decision</th>
                    <th className="px-6 pb-3 font-medium">Outcome</th>
                    <th className="px-6 pb-3 font-medium">Recovered</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCases.map((c) => (
                    <tr key={c.index} className="border-b border-brand-900/5 transition-colors last:border-0 hover:bg-mint-50/60">
                      <td className="px-6 py-3">
                        <div className="text-xs font-medium text-brand-900">{c.customerName}</div>
                        <div className="text-[11px] text-slate-400">{c.archetype}</div>
                      </td>
                      <td className="px-6 py-3 font-semibold text-brand-900">{formatINR(c.amount)}</td>
                      <td className="px-6 py-3 text-slate-500">{humanize(c.rootCause) || "—"}</td>
                      <td className="px-6 py-3 text-slate-500">
                        {c.recoveryProbability != null ? `${Math.round(c.recoveryProbability * 100)}%` : "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{humanize(c.selectedIntervention) || "—"}</td>
                      <td className="px-6 py-3 text-slate-500">{humanize(c.policyDecision) || "—"}</td>
                      <td className="px-6 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-3 text-slate-500">{c.recoveredAmount > 0 ? formatINR(c.recoveredAmount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
