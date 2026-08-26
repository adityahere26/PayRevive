import { useState } from "react";
import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { FloatingCurrency } from "../../components/floating/FloatingCurrency.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button, buttonClasses } from "../../components/ui/Button.jsx";
import { CheckCircleIcon, LinkIcon } from "../../components/ui/icons.jsx";
import { authInputClass, authLabelClass } from "./authField.js";

// A preview of what setting up a real merchant account would look like — reachable from the
// signup/login "unavailable" notices. Nothing here persists anywhere: there's no merchant
// registration backend for it to save to (see Login.jsx/Signup.jsx). Step 2's "Connect
// Razorpay" is the one control that could plausibly imply a real integration happened, so it's
// explicitly labeled preview-only and never claims a connection succeeded.
const STEPS = ["Business details", "Connect payment provider", "Recovery preferences", "Ready"];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col gap-1.5">
          <div className={`h-1 rounded-full ${i <= current ? "bg-emerald-500" : "bg-brand-100"}`} />
          <span className={`hidden text-[11px] font-medium sm:block ${i <= current ? "text-brand-800" : "text-brand-300"}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function BusinessDetailsStep({ form, setForm }) {
  return (
    <div className="space-y-4">
      <label className={authLabelClass}>
        Business name
        <input
          type="text"
          value={form.businessName}
          onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
          className={authInputClass}
        />
      </label>
      <label className={authLabelClass}>
        Website
        <input
          type="text"
          placeholder="https://"
          value={form.website}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          className={authInputClass}
        />
      </label>
      <label className={authLabelClass}>
        Business category
        <select
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className={authInputClass}
        >
          <option>E-commerce</option>
          <option>Subscriptions / SaaS</option>
          <option>Marketplace</option>
          <option>Other</option>
        </select>
      </label>
    </div>
  );
}

function ConnectProviderStep() {
  const [attempted, setAttempted] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-brand-900/10 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-950 text-white">
            <LinkIcon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-brand-900">Razorpay</div>
            <div className="text-xs text-brand-400">Payment links, webhooks, Test Mode</div>
          </div>
        </div>
        <button type="button" onClick={() => setAttempted(true)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Connect
        </button>
      </div>
      {attempted && (
        <Alert tone="info" title="Preview only — not connected">
          This onboarding flow isn't wired to a real Razorpay OAuth connection in this preview
          build, so nothing was actually connected. The live demo already runs against Razorpay
          Test Mode with pre-configured credentials.
        </Alert>
      )}
    </div>
  );
}

function RecoveryPreferencesStep({ form, setForm }) {
  return (
    <div className="space-y-5">
      <label className={authLabelClass}>
        Maximum recovery attempts
        <input
          type="range"
          min={1}
          max={5}
          value={form.maxAttempts}
          onChange={(e) => setForm((f) => ({ ...f, maxAttempts: Number(e.target.value) }))}
          className="mt-2 w-full accent-emerald-500"
        />
        <span className="text-xs text-brand-400">{form.maxAttempts} attempt{form.maxAttempts === 1 ? "" : "s"}</span>
      </label>
      <label className={authLabelClass}>
        High-value review threshold (₹)
        <input
          type="number"
          min={0}
          step={1000}
          value={form.threshold}
          onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
          className={authInputClass}
        />
        <span className="mt-1 block text-xs text-brand-400">Cases above this amount are escalated for human review, never auto-recovered.</span>
      </label>
    </div>
  );
}

function ReadyStep() {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-100 text-brand-700">
        <CheckCircleIcon className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-bold text-brand-900">This is what &ldquo;ready&rdquo; would look like</h2>
      <p className="max-w-sm text-sm leading-relaxed text-brand-500">
        A real account would land in the dashboard here. Since this preview build has no
        merchant registration backend yet, use the live demo to see that dashboard with real
        recovery-case data instead.
      </p>
      <Link to="/demo" className="mt-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-brand-950 hover:bg-emerald-400">
        View the live demo
      </Link>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    businessName: "",
    website: "",
    category: "E-commerce",
    maxAttempts: 3,
    threshold: 50000,
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="relative overflow-hidden bg-brand-950 px-6 pb-20 pt-14 sm:pb-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-7xl" tone="text-white/8" style={{ top: "6%", right: "8%" }} depth={10} />
          <FloatingCurrency symbol="$" size="text-lg" tone="border-mint-300/30 text-mint-300" style={{ bottom: "16%", left: "10%" }} depth={16} floatDelay={0.6} circle />
        </div>
        <div className="relative mx-auto max-w-lg text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-950">P</span>
            <span className="label-mono text-xs font-semibold text-white">PAYREVIVE</span>
          </Link>
          <p className="label-mono mt-5 text-[11px] text-mint-300">Set up in minutes</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">See what setup would look like.</h1>
        </div>
      </div>

      <div className="relative mx-auto -mt-10 max-w-lg px-6 pb-16">
        <RevealOnScroll className="rounded-3xl border border-brand-900/10 bg-white p-8 shadow-card-hover">
          <StepIndicator current={step} />
          <div className="mt-8">
            {step === 0 && <BusinessDetailsStep form={form} setForm={setForm} />}
            {step === 1 && <ConnectProviderStep />}
            {step === 2 && <RecoveryPreferencesStep form={form} setForm={setForm} />}
            {step === 3 && <ReadyStep />}
          </div>

          {step < 3 && (
            <div className="mt-8 flex items-center justify-between border-t border-brand-900/10 pt-6">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className={buttonClasses({ variant: "tertiary", size: "sm", className: "disabled:opacity-0" })}
              >
                Back
              </button>
              <Button size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))}>
                {step === 2 ? "Finish" : "Continue"}
              </Button>
            </div>
          )}
        </RevealOnScroll>
      </div>
    </div>
  );
}
