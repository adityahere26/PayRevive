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

function NumberField({ label, description, value, onChange, min, max, step = 1, suffix }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-brand-900">{label}</div>
      <div className="mt-0.5 text-xs text-slate-500">{description}</div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function ToggleField({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-brand-900">{label}</div>
        <div className="mt-0.5 text-xs text-slate-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-slate-200"}`}
      >
        <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </label>
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
    <form onSubmit={handleSave} className="space-y-6">
      <PageHeader
        title="Merchant Policy"
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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <NumberField
            label="Max Autonomous Amount"
            description="Cases above this amount are always escalated for manual review — never executed autonomously, regardless of any other factor."
            value={form.maxAutonomousAmount}
            onChange={(v) => set("maxAutonomousAmount", v)}
            min={0}
            max={100000000}
            suffix="₹"
          />
          <NumberField
            label="Escalation Amount (optional override)"
            description="Falls back to Max Autonomous Amount when left blank."
            value={form.escalationAmount}
            onChange={(v) => set("escalationAmount", v)}
            min={0}
            max={100000000}
            suffix="₹ · optional"
          />
          <NumberField
            label="Max Recovery Attempts"
            description="Maximum retry attempts before a case is permanently stopped."
            value={form.maxRecoveryAttempts}
            onChange={(v) => set("maxRecoveryAttempts", v)}
            min={0}
            max={20}
          />
          <NumberField
            label="Recovery Window"
            description="Hours after detection a case remains eligible for recovery before it expires."
            value={form.recoveryWindowHours}
            onChange={(v) => set("recoveryWindowHours", v)}
            min={1}
            max={2160}
            suffix="hours"
          />
        </div>
      </Card>

      <Card title="Voice Recovery" subtitle="Governs the Hinglish voice recovery channel (AGENT_DESIGN.md § Voice pipeline).">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ToggleField
            label="Voice Recovery Enabled"
            description="Allow voice recovery sessions to be started for this merchant's cases at all."
            checked={form.voiceEnabled}
            onChange={(v) => set("voiceEnabled", v)}
          />
          <NumberField
            label="Max Voice Attempts"
            description="Maximum voice recovery attempts per case before it's blocked from further voice contact."
            value={form.maxVoiceAttempts}
            onChange={(v) => set("maxVoiceAttempts", v)}
            min={0}
            max={10}
          />
        </div>
      </Card>

      <Card title="Customer Contact" subtitle="Contact frequency and opt-out handling.">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <NumberField
            label="Max Contact Attempts"
            description="Maximum total contact attempts across every channel before a case is stopped."
            value={form.maxContactAttempts}
            onChange={(v) => set("maxContactAttempts", v)}
            min={0}
            max={20}
          />
          <div>
            <div className="text-sm font-medium text-brand-900">Opt-Out Behavior</div>
            <div className="mt-0.5 text-xs text-slate-500">
              How PayRevive responds when a customer has opted out — an explicit opt-out always wins over every other rule, including a high-value escalation.
            </div>
            <div className="mt-2">
              <Badge tone="mint">{form.optOutBehavior.replace(/_/g, " ")}</Badge>
              <span className="ml-2 text-xs text-slate-400">only supported behavior currently</span>
            </div>
          </div>
        </div>
      </Card>
    </form>
  );
}
