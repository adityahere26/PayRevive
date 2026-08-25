import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { StaggerChildren } from "../../components/motion/StaggerChildren.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { ArrowRightIcon } from "../../components/ui/icons.jsx";

const STEPS = [
  {
    n: "01",
    title: "Detect",
    body: "A payment fails, or a checkout is started and abandoned. Both are detected by the same risk pipeline the moment they happen — a failed-payment webhook and an abandoned-checkout timeout feed the identical downstream flow.",
  },
  {
    n: "02",
    title: "Understand",
    body: "The root cause is classified — insufficient funds, a bank decline, an expired card, a network drop, or a customer who simply changed their mind. Customer history (past payments, prior recovery attempts) feeds a deterministic recovery-probability score.",
  },
  {
    n: "03",
    title: "Decide",
    body: "An intervention is selected: a payment link, a Hinglish voice call, a promise-to-pay, escalation to the merchant, or stopping outreach entirely. For voice, Gemini classifies what the customer actually said; for everything else, the score drives the choice.",
  },
  {
    n: "04",
    title: "Policy check",
    body: "Every candidate action — regardless of where it came from — passes through the same policy engine. Attempt limits, high-value review thresholds, the recovery window, and opt-out status are checked before anything executes.",
  },
  {
    n: "05",
    title: "Recover",
    body: "The approved action runs: a real Razorpay Test Mode payment link is created (once, idempotently), or a live voice session gathers the customer's response — never a fabricated outcome.",
  },
  {
    n: "06",
    title: "Confirm",
    body: "The real outcome is observed and the recovered amount recorded. Every step along the way — detection, diagnosis, scoring, policy decision, action, outcome — is written to a merchant-scoped audit trail.",
  },
];

const SCENARIOS = [
  {
    title: "Failed payment recovery",
    body: "Triggered the moment a payment fails. PayRevive retrieves payment and customer context, diagnoses the failure, scores recoverability, and works through the same detect → confirm loop above.",
  },
  {
    title: "Checkout abandonment recovery",
    body: "Triggered when a customer starts checkout but never completes it — a session sitting unpaid past a configurable window is treated as at-risk revenue and enters the identical pipeline.",
  },
];

export default function HowItWorks() {
  return (
    <div>
      <section className="bg-canvas py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow>How it works</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-xl text-5xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-6xl">
              One pipeline. Every safeguard.
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-slate-500">
              Detect → Diagnose → Decide → Policy check → Act → Observe → Recover → Measure →
              Audit. Every recovery case moves through all nine stages, traceably.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20 sm:px-8 sm:py-24">
        <StaggerChildren className="space-y-14" step={90}>
          {STEPS.map((s) => (
            <div key={s.n} className="flex flex-col gap-3 border-b border-slate-200/70 pb-14 last:border-0 sm:flex-row sm:items-baseline sm:gap-10">
              <span className="text-5xl font-bold text-brand-100 sm:text-6xl">{s.n}</span>
              <div>
                <div className="text-2xl font-bold tracking-tight text-brand-900">{s.title}</div>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-500">{s.body}</p>
              </div>
            </div>
          ))}
        </StaggerChildren>
      </section>

      <section className="bg-mint-50/40 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll className="text-center">
            <Eyebrow>Two triggers, one pipeline</Eyebrow>
            <h2 className="mx-auto mt-5 max-w-lg text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">
              Where a recovery case comes from
            </h2>
          </RevealOnScroll>
          <StaggerChildren className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2" step={100}>
            {SCENARIOS.map((s) => (
              <div key={s.title} className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-card">
                <h3 className="text-lg font-bold text-brand-900">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{s.body}</p>
              </div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 text-center sm:px-8">
          <RevealOnScroll>
            <h2 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">Explore the capabilities</h2>
            <Link
              to="/solutions"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
            >
              See solutions
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
