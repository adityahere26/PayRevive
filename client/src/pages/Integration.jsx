import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { SkeletonBlock } from "../components/ui/Skeleton.jsx";

// ARCHITECTURE.md § Inbound payment-failure webhook (connected merchants). This page shows the
// per-merchant webhook URL + signing secret a business pastes into their Razorpay Dashboard;
// from then on their real `payment.failed` events flow into the same recovery pipeline the demo
// "Simulate Payment Failure" control uses. No recovery/policy logic lives here — it only reads
// and rotates the credential (server/src/routes/integration.js).

function CopyField({ label, value, secret = false }) {
  const [revealed, setRevealed] = useState(!secret);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const shown = revealed ? value : "•".repeat(Math.min(44, (value || "").length));

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] text-brand-900">
          {shown || "—"}
        </code>
        {secret && (
          <Button variant="tertiary" size="sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Reveal"}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={copy} disabled={!value}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

const SETUP_STEPS = [
  "Open your Razorpay Dashboard → Settings → Webhooks → Add New Webhook.",
  "Paste the Webhook URL above into the URL field.",
  "Paste the Signing secret above into the Secret field.",
  'Under "Active Events", select payment.failed.',
  "Save. Razorpay sends a test event immediately — the case shows up on Payments and Recovery.",
];

export default function Integration() {
  const [integration, setIntegration] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState(null);
  const [rotated, setRotated] = useState(false);

  function load() {
    setLoadError(null);
    api
      .getIntegration()
      .then(({ integration }) => setIntegration(integration))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function regenerate() {
    if (!window.confirm("Rotate the signing secret and webhook URL? The current URL stops working immediately — you'll need to update Razorpay with both new values.")) {
      return;
    }
    setRotating(true);
    setRotateError(null);
    setRotated(false);
    try {
      const { integration } = await api.regenerateWebhookSecret();
      setIntegration(integration);
      setRotated(true);
    } catch (err) {
      setRotateError(err.message);
    } finally {
      setRotating(false);
    }
  }

  if (loadError) {
    return (
      <Alert
        tone="danger"
        title="Could not load integration settings"
        action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}
      >
        {loadError}
      </Alert>
    );
  }

  if (!integration) {
    return (
      <Card>
        <SkeletonBlock className="h-3 w-32" />
        <div className="mt-4 space-y-4">
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-10" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<span className="label-mono text-xs font-medium text-slate-400">INTEGRATION</span>}
        title="Connect your Razorpay account."
        description="Point your Razorpay webhooks at PayRevive and every failed payment is analysed, planned, and queued for your approval automatically — no code to deploy."
      />

      {rotated && (
        <Alert tone="success" title="Secret rotated">
          Update your Razorpay webhook with the new URL and signing secret below. The previous URL no longer accepts events.
        </Alert>
      )}
      {rotateError && <Alert tone="danger" title="Could not rotate secret">{rotateError}</Alert>}

      <Card
        title="Razorpay webhook"
        subtitle="Signature-verified on every delivery (HMAC-SHA256). PayRevive never receives your Razorpay API keys."
        action={<Badge tone="mint">Live path</Badge>}
      >
        <div className="space-y-5">
          <CopyField label="Webhook URL" value={integration.webhookUrl} />
          <CopyField label="Signing secret" value={integration.webhookSecret} secret />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Subscribe to:</span>
            {integration.events.map((e) => (
              <code key={e} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                {e}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-brand-900/10 pt-4">
            <Button variant="secondary" size="sm" onClick={regenerate} disabled={rotating}>
              {rotating ? "Rotating…" : "Regenerate secret"}
            </Button>
            <span className="text-xs text-slate-400">
              Rotates the URL and secret. Use if the secret may be exposed.
            </span>
          </div>
        </div>
      </Card>

      <Card title="Setup steps" subtitle="Takes about two minutes.">
        <ol className="space-y-3">
          {SETUP_STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-brand-900">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-950 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="One-click connect" subtitle="Authorise once, no URLs or secrets to copy. Coming soon.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled title="Coming soon">
            Connect with Razorpay
          </Button>
          <Badge tone="slate">Roadmap</Badge>
          <span className="text-xs text-slate-400">
            OAuth account connect — PayRevive registers the webhook for you and reads failed
            payments on your behalf.
          </span>
        </div>
      </Card>
    </div>
  );
}
