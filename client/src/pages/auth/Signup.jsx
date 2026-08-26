import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../../components/marketing/AuthShell.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button, buttonClasses } from "../../components/ui/Button.jsx";
import { api, setToken } from "../../api/client.js";
import { authInputClass, authLabelClass, authCheckboxClass } from "./authField.js";

// UI shell only — see Login.jsx's note. Full client-side validation (including a real password
// strength check) runs before submit; the submit itself has nothing to call, so it never claims
// an account was created. "Continue with live demo" is the one real, working path from here.
function passwordStrength(pw) {
  if (!pw) return { label: "", pct: 0, tone: "bg-brand-200" };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const levels = [
    { label: "Too short", tone: "bg-red-400" },
    { label: "Weak", tone: "bg-red-400" },
    { label: "Fair", tone: "bg-amber-400" },
    { label: "Good", tone: "bg-brand-600" },
    { label: "Strong", tone: "bg-brand-800" },
    { label: "Very strong", tone: "bg-brand-950" },
  ];
  const level = levels[Math.min(score, levels.length - 1)];
  return { ...level, pct: Math.min(100, (score / 5) * 100) };
}

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", business: "", email: "", password: "", agree: false });
  const [status, setStatus] = useState("idle"); // idle | loading | unavailable
  const [demoStatus, setDemoStatus] = useState("idle");
  const [demoError, setDemoError] = useState(null);

  const strength = passwordStrength(form.password);

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    window.setTimeout(() => setStatus("unavailable"), 600);
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
      eyebrow={<Eyebrow>Get started</Eyebrow>}
      title="Create your account"
      subtitle="Account creation isn't live in this preview build — use the demo below to explore the product today."
      statement="Recover revenue before it's lost."
      statementSupport="PayRevive detects failed payments, decides the safest recovery action, and helps you recover automatically."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-950 underline underline-offset-2 hover:text-brand-600">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={authLabelClass}>
          Name
          <input
            type="text"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={authInputClass}
          />
        </label>
        <label className={authLabelClass}>
          Business name
          <input
            type="text"
            required
            value={form.business}
            onChange={(e) => setForm((f) => ({ ...f, business: e.target.value }))}
            className={authInputClass}
          />
        </label>
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
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className={authInputClass}
          />
          {form.password && (
            <div className="mt-1.5">
              <div className="h-1 w-full overflow-hidden rounded-full bg-brand-100">
                <div className={`h-full rounded-full transition-all ${strength.tone}`} style={{ width: `${strength.pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-brand-400">{strength.label}</div>
            </div>
          )}
        </label>
        <label className="flex items-start gap-2 text-xs text-brand-500">
          <input
            type="checkbox"
            required
            checked={form.agree}
            onChange={(e) => setForm((f) => ({ ...f, agree: e.target.checked }))}
            className={`mt-0.5 ${authCheckboxClass}`}
          />
          I agree to the terms of service and privacy policy.
        </label>
        <Button type="submit" disabled={status === "loading"} className="w-full">
          {status === "loading" ? "Creating account…" : "Create account"}
        </Button>
      </form>

      {status === "unavailable" && (
        <div className="mt-4">
          <Alert tone="info" title="Account creation isn't available yet">
            This preview build has one working entry point — the live demo below. Curious what
            setup would look like?{" "}
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
