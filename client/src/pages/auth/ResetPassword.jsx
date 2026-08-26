import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthShell } from "../../components/marketing/AuthShell.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { AlertTriangleIcon } from "../../components/ui/icons.jsx";
import { authInputClass, authLabelClass } from "./authField.js";

// A reset link always carries a token in its URL. No token means this wasn't reached via a
// real reset email — shown as the same "invalid or expired" state a real expired token would
// produce, rather than rendering a form with nothing valid to submit.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | unavailable

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    window.setTimeout(() => setStatus("unavailable"), 500);
  }

  if (!token) {
    return (
      <AuthShell
        eyebrow={<Eyebrow>Password reset</Eyebrow>}
        title="This link is invalid or has expired"
        statement="Every recovery has a decision behind it."
        statementSupport="This one just isn't valid anymore — request a fresh link, or skip straight to the live demo."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500">
            <AlertTriangleIcon className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed text-brand-500">
            Reset links expire after a short time, and this one is missing its token. Request a
            new one, or use the live demo — no password required.
          </p>
          <div className="flex w-full flex-col gap-2">
            <Link to="/forgot-password" className="gradient-cta rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white transition-all hover:brightness-110">
              Request a new link
            </Link>
            <Link to="/demo" className="rounded-full border border-brand-900/15 px-4 py-2.5 text-center text-sm font-medium text-brand-800 hover:bg-brand-50">
              Use the live demo
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={<Eyebrow>Password reset</Eyebrow>}
      title="Choose a new password"
      statement="Every recovery has a decision behind it."
      statementSupport="Policy-bounded, reviewed, and always accountable — the same discipline applies here."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={authLabelClass}>
          New password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </label>
        <Button type="submit" disabled={status === "loading"} className="w-full">
          {status === "loading" ? "Resetting…" : "Reset password"}
        </Button>
      </form>

      {status === "unavailable" && (
        <div className="mt-4">
          <Alert tone="info" title="Password reset isn't available yet">
            There's no merchant account behind this token in this preview build.{" "}
            <Link to="/demo" className="font-medium underline underline-offset-2">
              Use the live demo
            </Link>{" "}
            instead.
          </Alert>
        </div>
      )}
    </AuthShell>
  );
}
