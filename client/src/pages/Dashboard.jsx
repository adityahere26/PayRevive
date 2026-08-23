import { useEffect, useState } from "react";
import { api } from "../api/client.js";

// Foundation-phase Dashboard: proves the client can reach the backend end to end (via
// GET /api/health) rather than showing fabricated metrics. Real dashboard metrics
// (SPEC.md § Dashboard) come with the recovery pipeline in a later phase.
export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Placeholder — revenue-at-risk, recovered revenue, and funnel metrics are not
          implemented yet (SPEC.md § P0/P1 phasing).
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700">Backend connectivity</h2>
        {error && <p className="mt-2 text-sm text-red-600">Could not reach the API: {error}</p>}
        {health && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">status</dt>
            <dd className="font-mono">{health.status}</dd>
            <dt className="text-slate-500">database</dt>
            <dd className="font-mono">{health.database}</dd>
            <dt className="text-slate-500">environment</dt>
            <dd className="font-mono">{health.environment}</dd>
          </dl>
        )}
        {!health && !error && <p className="mt-2 text-sm text-slate-400">Checking…</p>}
      </div>
    </div>
  );
}
