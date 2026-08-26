import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthShell } from "../../components/marketing/AuthShell.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { authInputClass, authLabelClass } from "./authField.js";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | unavailable

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    window.setTimeout(() => setStatus("unavailable"), 500);
  }

  return (
    <AuthShell
      eyebrow={<Eyebrow>Password reset</Eyebrow>}
      title="Forgot your password?"
      subtitle="Enter the email on your account and we'll send a reset link — once real accounts exist."
      statement="Access is temporary. Recovery isn't."
      statementSupport="Real password recovery lands with merchant accounts — until then, the live demo needs no password at all."
      footer={
        <Link to="/login" className="font-medium text-brand-950 underline underline-offset-2 hover:text-brand-600">
          ← Back to log in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={authLabelClass}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
        </label>
        <Button type="submit" disabled={status === "loading"} className="w-full">
          {status === "loading" ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      {status === "unavailable" && (
        <div className="mt-4">
          <Alert tone="info" title="Password reset isn't available yet">
            There's no merchant account to reset in this preview build. Use{" "}
            <Link to="/demo" className="font-medium underline underline-offset-2">
              the live demo
            </Link>{" "}
            instead — no password required.
          </Alert>
        </div>
      )}
    </AuthShell>
  );
}
