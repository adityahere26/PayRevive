import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client.js";

// SPEC.md § Demo mode: evaluators should never need to register. This is the only working
// auth flow in the Day 2 foundation — real merchant login isn't built yet.
export default function DemoEntry() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState(null);

  async function handleEnterDemo() {
    setStatus("loading");
    setError(null);
    try {
      const { token } = await api.authDemo();
      setToken(token);
      navigate("/dashboard");
    } catch (err) {
      setStatus("error");
      setError(err.message);
      return;
    }
    setStatus("idle");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">payrevive</h1>
        <p className="mt-1 text-sm text-slate-500">
          Detect revenue at risk. Recover what can be recovered. Stop when it should.
        </p>

        <button
          type="button"
          onClick={handleEnterDemo}
          disabled={status === "loading"}
          className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {status === "loading" ? "Entering demo…" : "Enter Demo"}
        </button>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <p className="mt-4 text-xs text-slate-400">
          Uses a pre-seeded, isolated demo merchant. No account required. Synthetic data only.
        </p>
      </div>
    </div>
  );
}
