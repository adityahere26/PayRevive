import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../../components/marketing/AuthShell.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button, buttonClasses } from "../../components/ui/Button.jsx";
import { api, setToken } from "../../api/client.js";
import { authInputClass, authLabelClass, authCheckboxClass } from "./authField.js";

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
      statement="Every recovery has a decision behind it."
      statementSupport="Policy-bounded, reviewed, and always accountable — see exactly why each payment was recovered the way it was."
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="font-medium text-brand-950 underline underline-offset-2 hover:text-emerald-600">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={authLabelClass}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={authInputClass}
          />
        </label>
        <label className={authLabelClass}>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className={authInputClass}
          />
        </label>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-brand-600">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))}
              className={authCheckboxClass}
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-medium text-brand-950 underline underline-offset-2 hover:text-emerald-600">
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

      <div className="mt-6 border-t border-brand-900/10 pt-6">
        <button type="button" onClick={handleDemo} disabled={demoStatus === "loading"} className={buttonClasses({ variant: "secondary", className: "w-full" })}>
          {demoStatus === "loading" ? "Entering demo…" : "Continue with live demo"}
        </button>
        {demoError && <p className="mt-2 text-xs text-red-600">{demoError}</p>}
      </div>
    </AuthShell>
  );
}
