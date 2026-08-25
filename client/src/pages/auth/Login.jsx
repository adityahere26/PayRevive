import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../../components/marketing/AuthShell.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button, buttonClasses } from "../../components/ui/Button.jsx";
import { api, setToken } from "../../api/client.js";

// UI shell only, by design — see this session's brief. There is no merchant registration/login
// endpoint in this build (server/src/routes/auth.js only issues demo tokens; SECURITY.md §
// Demo authentication). Validation, loading, and error states are all real; a successful
// account login is not, because there's no backend to actually authenticate against — so this
// never fakes one. "Continue with live demo" below is the one path that's genuinely wired up.
export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [status, setStatus] = useState("idle"); // idle | loading | unavailable
  const [demoStatus, setDemoStatus] = useState("idle");
  const [demoError, setDemoError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    window.setTimeout(() => setStatus("unavailable"), 500);
  }

  async function handleDemo() {
    setDemoStatus("loading");
    setDemoError(null);
    try {
      const { token } = await api.authDemo();
      setToken(token);
      navigate("/dashboard");
    } catch (err) {
      setDemoStatus("idle");
      setDemoError(err.message);
    }
  }

  return (
    <AuthShell
      eyebrow={<Eyebrow>Welcome back</Eyebrow>}
      title="Log in"
      subtitle="Real merchant accounts aren't live in this preview build — use the demo below to explore the product."
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="font-medium text-brand-700 hover:text-brand-900">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-slate-600">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </label>
        <label className="block text-sm text-slate-600">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </label>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-400"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:text-brand-900">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={status === "loading"} className="w-full">
          {status === "loading" ? "Logging in…" : "Log in"}
        </Button>
      </form>

      {status === "unavailable" && (
        <div className="mt-4">
          <Alert tone="info" title="Account login isn't available yet">
            This preview build has one working entry point — the live demo below. Want to see
            what account setup would look like instead?{" "}
            <Link to="/onboarding" className="font-medium underline underline-offset-2">
              Preview onboarding
            </Link>
            .
          </Alert>
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-6">
        <button type="button" onClick={handleDemo} disabled={demoStatus === "loading"} className={buttonClasses({ variant: "secondary", className: "w-full" })}>
          {demoStatus === "loading" ? "Entering demo…" : "Continue with live demo"}
        </button>
        {demoError && <p className="mt-2 text-xs text-red-600">{demoError}</p>}
      </div>
    </AuthShell>
  );
}
