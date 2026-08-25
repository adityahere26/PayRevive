import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { humanize } from "../lib/format.js";
import { STATUS_META } from "../lib/statusMeta.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { FileTextIcon, RefreshIcon } from "../components/ui/icons.jsx";

// AGENT_DESIGN.md § The ten modules (Audit Logger) / CLAUDE.md core principle #4: "If it's
// not audited, it didn't happen." Every row here is a real AuditLog document from
// GET /api/audit-log (server/src/routes/auditLog.js) — the SAME collection the per-case
// "Explainable Timeline" on Recovery Case Detail reads, just merchant-wide instead of
// scoped to one case. Nothing on this page is fabricated.

const PAGE_LIMIT = 25;

// Some audit entries carry a RecoveryCase status as their `result` (e.g. ELIGIBILITY_EVALUATED,
// POLICY_EVALUATED) — render those with the same StatusBadge the rest of the app uses. Others
// carry a probability, an intervention name, or a free-text outcome — render as plain text.
function ResultCell({ result }) {
  if (!result) return <span className="text-slate-400">—</span>;
  if (STATUS_META[result]) return <StatusBadge status={result} size="sm" />;
  return <span className="font-mono text-xs text-slate-600">{result}</span>;
}

// Distinguishes a real Razorpay Test Mode action from a demo/simulated one, straight from the
// same metadata fields routes/recoveryCases.js and routes/voice.js already write.
function SourceTag({ metadata }) {
  if (metadata?.live) return <Badge tone="brand" size="sm">Razorpay Test Mode</Badge>;
  if (metadata?.simulated) return <Badge tone="slate" size="sm">Simulated</Badge>;
  return null;
}

export default function AuditTrail() {
  const [events, setEvents] = useState(null);
  const [total, setTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState([]);
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    const params = { page, limit: PAGE_LIMIT };
    if (eventTypeFilter) params.eventType = eventTypeFilter;
    if (search.trim()) params.search = search.trim();
    api
      .listAuditLog(params)
      .then((res) => {
        setEvents(res.events);
        setTotal(res.total);
        setEventTypes(res.eventTypes);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, eventTypeFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Every detection, decision, policy check, and action across all recovery cases — in order, merchant-scoped, and never editable."
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-800 shadow-sm hover:bg-mint-50">
            <RefreshIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">
            Event type
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPage(1);
              }}
              className="mt-1 block w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">All event types</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
            <label className="text-sm text-slate-600">
              Search reason / result
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. HIGH_VALUE, APPROVED…"
                className="mt-1 block w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
            <Button type="submit" variant="secondary" size="md">Search</Button>
          </form>
          {(eventTypeFilter || search) && (
            <button
              type="button"
              onClick={() => {
                setEventTypeFilter("");
                setSearch("");
                setPage(1);
              }}
              className="text-xs font-medium text-slate-400 hover:text-brand-700"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{total} event{total === 1 ? "" : "s"}</span>
        </div>
      </Card>

      {error && (
        <Alert tone="danger" title="Could not load the audit trail" action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {!events && !error && (
        <Card>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} className="h-9" />
            ))}
          </div>
        </Card>
      )}

      {events && events.length === 0 && !error && (
        <EmptyState
          icon={<FileTextIcon className="h-5 w-5" />}
          title="No audit events match this filter"
          description="Trigger a recovery case from the Dashboard and evaluate it to start generating audit events."
        />
      )}

      {events && events.length > 0 && (
        <Card bodyClassName="-mx-6 -mb-2 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-2 font-medium">Time</th>
                <th className="px-6 py-2 font-medium">Case</th>
                <th className="px-6 py-2 font-medium">Event</th>
                <th className="px-6 py-2 font-medium">Reason</th>
                <th className="px-6 py-2 font-medium">Result</th>
                <th className="px-6 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {events.map((entry) => (
                <tr key={entry._id} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-mint-50/60">
                  <td className="whitespace-nowrap px-6 py-2.5 text-slate-500">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-2.5">
                    {entry.caseId ? (
                      <Link to={`/recovery-cases/${entry.caseId}`} className="font-mono text-xs text-slate-600 hover:text-brand-700 hover:underline">
                        {entry.caseId}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">merchant-level</span>
                    )}
                  </td>
                  <td className="px-6 py-2.5 font-mono text-xs text-slate-700">{entry.eventType}</td>
                  <td className="px-6 py-2.5 text-slate-500">{humanize(entry.reason) || entry.reason || "—"}</td>
                  <td className="px-6 py-2.5">
                    <ResultCell result={entry.result} />
                  </td>
                  <td className="px-6 py-2.5">
                    <SourceTag metadata={entry.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
            <span className="text-xs text-slate-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
