import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";

// RECOVERY_POLICY.md § Merchant policy fields. This UI only reads/writes the SAME
// merchant.policy subdocument (server/src/models/Merchant.js) the Policy Engine
// (server/src/policy/policyPrecedence.js) already reads fresh from the database on every
// pipeline run (routes/recoveryCases.js, routes/voice.js) — no policy decision logic (STOP /
// ESCALATE / APPROVE) is duplicated here. Saving here changes what the NEXT evaluation does;
// it never touches an in-flight case retroactively.

// A single "large question, control beside it" row — the premium-configuration treatment the
// redesign calls for, in place of the old small-label/input form. Question + control only;
// the description carries the boring-but-necessary caveat text in restrained supporting copy.
function PolicyQuestion({ question, description, children }) {
  return (
    <div className="flex flex-col gap-4 border-t border-brand-900/10 py-7 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
      <div className="sm:max-w-md">
        <h3 className="text-xl font-semibold leading-snug tracking-tight text-brand-950 sm:text-2xl">{question}</h3>
        {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="shrink-0 sm:pl-6">{children}</div>
    </div>
  );
}

function NumberControl({ value, onChange, min, max, step = 1, suffix }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold text-brand-950 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      {suffix && <span className="label-mono text-[11px] text-slate-400">{suffix}</span>}
    </div>
  );
}

function ToggleControl({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-brand-200"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function MerchantPolicy() {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedFields, setSavedFields] = useState(null);

  function load() {
    setLoadError(null);
    api
      .getMerchantPolicy()
      .then(({ policy }) =>
        setForm({
          maxAutonomousAmount: String(policy.maxAutonomousAmount),
          maxRecoveryAttempts: String(policy.maxRecoveryAttempts),
          recoveryWindowHours: String(policy.recoveryWindowHours),
          maxVoiceAttempts: String(policy.maxVoiceAttempts),
          voiceEnabled: policy.voiceEnabled,
          maxContactAttempts: String(policy.maxContactAttempts),
          escalationAmount: policy.escalationAmount == null ? "" : String(policy.escalationAmount),
          optOutBehavior: policy.optOutBehavior,
        })
      )
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSavedFields(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSavedFields(null);
    try {
      const { changedFields } = await api.updateMerchantPolicy({
        maxAutonomousAmount: Number(form.maxAutonomousAmount),
        maxRecoveryAttempts: Number(form.maxRecoveryAttempts),
        recoveryWindowHours: Number(form.recoveryWindowHours),
        maxVoiceAttempts: Number(form.maxVoiceAttempts),
        voiceEnabled: form.voiceEnabled,
        maxContactAttempts: Number(form.maxContactAttempts),
        escalationAmount: form.escalationAmount === "" ? null : Number(form.escalationAmount),
      });
      setSavedFields(changedFields);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <Alert tone="danger" title="Could not load merchant policy" action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}>
        {loadError}
      </Alert>
    );
  }

  if (!form) {
    return (
      <Card>
        <SkeletonBlock className="h-3 w-32" />
        <div className="mt-4 space-y-4">
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-10" />
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <PageHeader
        eyebrow={<span className="label-mono text-xs font-medium text-slate-400">MERCHANT POLICY</span>}
        title="Set the boundaries of autonomy."
        description="The deterministic rules the Policy Engine enforces on every recovery case — never overridden by the AI planner (AGENT_DESIGN.md § core principle)."
        actions={
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        }
      />

      {savedFields && (
        <Alert tone="success" title="Policy updated">
          {savedFields.length === 0
            ? "No changes to save."
            : `Updated: ${savedFields.join(", ")}. Takes effect on the next case evaluation.`}
        </Alert>
      )}
      {saveError && <Alert tone="danger" title="Could not save policy">{saveError}</Alert>}

      <Card title="Recovery Limits" subtitle="Controls how much autonomy the deterministic pipeline has before a human must review.">
        <PolicyQuestion
          question="How much revenue can PayRevive recover autonomously?"
          description="Cases above this amount are always escalated for manual review — never executed autonomously, regardless of any other factor."
        >
          <NumberControl value={form.maxAutonomousAmount} onChange={(v) => set("maxAutonomousAmount", v)} min={0} max={100000000} suffix="₹" />
        </PolicyQuestion>
        <PolicyQuestion
          question="When should a case be escalated instead?"
          description="Optional override — falls back to Max Autonomous Amount when left blank."
        >
          <NumberControl value={form.escalationAmount} onChange={(v) => set("escalationAmount", v)} min={0} max={100000000} suffix="₹ · optional" />
        </PolicyQuestion>
        <PolicyQuestion
          question="How many times should PayRevive retry a failed payment?"
          description="Maximum retry attempts before a case is permanently stopped."
        >
          <NumberControl value={form.maxRecoveryAttempts} onChange={(v) => set("maxRecoveryAttempts", v)} min={0} max={20} />
        </PolicyQuestion>
        <PolicyQuestion
          question="How long does a case stay eligible for recovery?"
          description="Hours after detection a case remains eligible before it expires."
        >
          <NumberControl value={form.recoveryWindowHours} onChange={(v) => set("recoveryWindowHours", v)} min={1} max={2160} suffix="hours" />
        </PolicyQuestion>
      </Card>

      <Card title="Voice Recovery" subtitle="Governs the Hinglish voice recovery channel (AGENT_DESIGN.md § Voice pipeline).">
        <PolicyQuestion
          question="Should PayRevive call customers directly?"
          description="Allow voice recovery sessions to be started for this merchant's cases at all."
        >
          <ToggleControl checked={form.voiceEnabled} onChange={(v) => set("voiceEnabled", v)} />
        </PolicyQuestion>
        <PolicyQuestion
          question="How many voice attempts before PayRevive stops calling?"
          description="Maximum voice recovery attempts per case before it's blocked from further voice contact."
        >
          <NumberControl value={form.maxVoiceAttempts} onChange={(v) => set("maxVoiceAttempts", v)} min={0} max={10} />
        </PolicyQuestion>
      </Card>

      <Card title="Customer Contact" subtitle="Contact frequency and opt-out handling.">
        <PolicyQuestion
          question="How many total contact attempts before PayRevive stops entirely?"
          description="Maximum total contact attempts across every channel before a case is stopped."
        >
          <NumberControl value={form.maxContactAttempts} onChange={(v) => set("maxContactAttempts", v)} min={0} max={20} />
        </PolicyQuestion>
        <PolicyQuestion
          question="What happens when a customer opts out?"
          description="An explicit opt-out always wins over every other rule, including a high-value escalation."
        >
          <div className="flex items-center gap-2">
            <Badge tone="mint">{form.optOutBehavior.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-slate-400">only supported behavior currently</span>
          </div>
        </PolicyQuestion>
      </Card>
    </form>
  );
}
