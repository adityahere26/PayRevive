import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client.js";
import { Button } from "../components/ui/Button.jsx";

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
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-sm font-bold text-white">
          P
        </span>
        <h1 className="mt-4 text-lg font-bold tracking-tight text-brand-900">payrevive</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          Detect revenue at risk. Recover what can be recovered. Stop when it should.
        </p>

        <Button onClick={handleEnterDemo} disabled={status === "loading"} className="mt-6 w-full" size="lg">
          {status === "loading" ? "Entering demo…" : "Enter Demo"}
        </Button>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <p className="mt-5 text-xs text-slate-400">
          Uses a pre-seeded, isolated demo merchant. No account required. Synthetic data only.
        </p>
      </div>
    </div>
  );
}
