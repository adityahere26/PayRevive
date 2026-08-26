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

// Human labels for the real eventType strings the server actually writes (grepped from
// server/src — REVENUE_RISK_DETECTED, ROOT_CAUSE_IDENTIFIED, RECOVERY_SCORED,
// ELIGIBILITY_EVALUATED, AI_RECOMMENDATION_CREATED, INTERVENTION_SELECTED, POLICY_EVALUATED,
// PAYMENT_LINK_CREATED/CREATION_FAILED, ACTION_SIMULATED, RAZORPAY_WEBHOOK_VERIFIED/REJECTED,
// VOICE_SESSION_STARTED/ENDED, VOICE_INTENT_DETECTED, VOICE_RESPONSE_GENERATED,
// MERCHANT_POLICY_UPDATED). Anything not in this map still renders — via humanize() — so a
// future event type never breaks the page; nothing here is an invented stage the backend
// doesn't actually emit.
const EVENT_LABELS = {
  REVENUE_RISK_DETECTED: "Payment Failed — Revenue At Risk",
  ROOT_CAUSE_IDENTIFIED: "Root Cause Identified",
  RECOVERY_SCORED: "Recovery Scored",
  ELIGIBILITY_EVALUATED: "Eligibility Checked",
  AI_RECOMMENDATION_CREATED: "AI Recommendation Created",
  INTERVENTION_SELECTED: "Intervention Selected",
  POLICY_EVALUATED: "Policy Evaluated",
  PAYMENT_LINK_CREATED: "Payment Link Created",
  PAYMENT_LINK_CREATION_FAILED: "Payment Link Creation Failed",
  ACTION_SIMULATED: "Action Simulated",
  RAZORPAY_WEBHOOK_VERIFIED: "Razorpay Webhook Verified",
  RAZORPAY_WEBHOOK_REJECTED: "Razorpay Webhook Rejected",
  VOICE_SESSION_STARTED: "Voice Session Started",
  VOICE_INTENT_DETECTED: "Voice Intent Detected",
  VOICE_RESPONSE_GENERATED: "Voice Response Generated",
  VOICE_SESSION_ENDED: "Voice Session Ended",
  MERCHANT_POLICY_UPDATED: "Merchant Policy Updated",
};

function eventLabel(eventType) {
  return EVENT_LABELS[eventType] || humanize(eventType) || eventType;
}

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

// One event in the editorial timeline. Deliberately not a fixed 7-stage pipeline diagram —
// not every case reaches every stage (a STOPPED case never sees a webhook; a payment-link
// case never sees a voice event) — so this renders exactly the real events the API returned,
// in order, with a connecting rail. Hover reveals the raw eventType + full timestamp.
function TimelineRow({ entry }) {
  return (
    <li className="group relative border-b border-brand-900/8 py-5 pl-8 last:border-0 sm:pl-10">
      <span className="absolute left-0 top-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-brand-400 ring-1 ring-brand-900/10 group-hover:bg-brand-950 sm:left-1" />
      <span className="absolute left-[3px] top-8 bottom-0 w-px bg-brand-900/8 sm:left-[7px]" />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-brand-950">{eventLabel(entry.eventType)}</span>
            <SourceTag metadata={entry.metadata} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{humanize(entry.reason) || entry.reason || "No reason recorded"}</span>
            {entry.caseId && (
              <Link to={`/recovery-cases/${entry.caseId}`} className="font-mono text-[11px] text-slate-400 hover:text-brand-700 hover:underline">
                {entry.caseId}
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ResultCell result={entry.result} />
          <span className="label-mono text-[10px] text-slate-400">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="label-mono mt-0 max-h-0 overflow-hidden text-[10px] text-slate-300 opacity-0 transition-all duration-300 group-hover:mt-2 group-hover:max-h-6 group-hover:opacity-100">
        {entry.eventType}
      </div>
    </li>
  );
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
    <div className="space-y-8">
      <PageHeader
        eyebrow={<span className="label-mono text-xs font-medium text-slate-400">AUDIT TRAIL</span>}
        title="Every decision, on the record."
        description="Every detection, decision, policy check, and action across all recovery cases — in order, merchant-scoped, and never editable."
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-full border border-brand-900/15 bg-white px-3.5 py-1.5 text-xs font-medium text-brand-800 shadow-sm hover:border-brand-400">
            <RefreshIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="label-mono text-[11px] text-slate-500">
            Event type
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPage(1);
              }}
              className="mt-2 block w-56 rounded-lg border border-slate-200 px-3 py-1.5 font-sans text-sm normal-case tracking-normal text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">All event types</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {eventLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
            <label className="label-mono text-[11px] text-slate-500">
              Search reason / result
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. HIGH_VALUE, APPROVED…"
                className="mt-2 block w-56 rounded-lg border border-slate-200 px-3 py-1.5 font-sans text-sm normal-case tracking-normal text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
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
          <span className="label-mono ml-auto text-[11px] text-slate-400">{total} event{total === 1 ? "" : "s"}</span>
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
        <Card bodyClassName="-mt-2">
          <ol>
            {events.map((entry) => (
              <TimelineRow key={entry._id} entry={entry} />
            ))}
          </ol>
          <div className="flex items-center justify-between border-t border-brand-900/10 pt-4">
            <span className="label-mono text-[11px] text-slate-400">
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
