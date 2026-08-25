import { useState } from "react";
import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { StaggerChildren } from "../../components/motion/StaggerChildren.jsx";
import { Marquee } from "../../components/motion/Marquee.jsx";
import { MagneticButton } from "../../components/motion/MagneticButton.jsx";
import { FloatingCurrency } from "../../components/floating/FloatingCurrency.jsx";
import { FloatingReview } from "../../components/floating/FloatingReview.jsx";
import { FloatingMetric } from "../../components/floating/FloatingMetric.jsx";
import { FloatingBadge } from "../../components/floating/FloatingBadge.jsx";
import { Eyebrow, DemoTag } from "../../components/marketing/Eyebrow.jsx";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  SparkleIcon,
  LinkIcon,
  MicIcon,
  ShieldCheckIcon,
  WaveformIcon,
} from "../../components/ui/icons.jsx";

// The public marketing landing page — Cyrclo-style page rhythm (oversized hero, marquee,
// editorial problem statement, a numbered story sequence, alternating capability sections,
// demo-labeled results/case-study/reviews, FAQ, dark final CTA) rebuilt entirely with
// PayRevive's own content and the real product's design tokens (index.css). No Cyrclo text,
// imagery, or assets are reused — only the compositional approach.
//
// Every number/quote below that isn't computed from a real API response is explicitly labeled
// "Example"/"Demo" — this page has no authenticated session, so it never has a real merchant's
// figures to show, and must not imply otherwise (CLAUDE.md § honesty requirement extended to
// the public site).

const MARQUEE_WORDS = ["Recover Revenue", "Detect Risk", "Act Early", "AI Decisions", "Policy Checked", "Hinglish Voice"];

const FAILURE_CAUSES = [
  { n: "01", label: "Insufficient funds", note: "Often retryable — the customer usually intends to pay." },
  { n: "02", label: "Bank declined", note: "Non-retryable — needs a different path back to payment." },
  { n: "03", label: "Card expired", note: "A payment-method problem, not a refusal." },
  { n: "04", label: "Network interruption", note: "The checkout dropped before it ever completed." },
  { n: "05", label: "Customers who meant to pay", note: "Distraction, not decline — the most recoverable group." },
];

const STORY_STEPS = [
  { n: "01", title: "Detect", body: "A failed payment or an abandoned checkout is flagged the moment it happens — not on a nightly batch job." },
  { n: "02", title: "Understand", body: "Root cause, customer history, and a recovery probability are computed deterministically from real payment data." },
  { n: "03", title: "Decide", body: "PayRevive's AI planner recommends an intervention. It's advisory — the recommendation never executes on its own." },
  { n: "04", title: "Recover", body: "A Razorpay Test Mode payment link is sent, a Hinglish voice call is placed, or the case is escalated — whichever the policy engine allows." },
  { n: "05", title: "Confirm", body: "The outcome is verified against what actually happened, and every step is written to a merchant-scoped audit trail." },
];

function DecisionMock() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-card-hover">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">AI recommendation</div>
      <div className="mt-1.5 text-sm font-semibold text-brand-900">Create payment link</div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Policy engine</span>
        <span className="rounded-full bg-mint-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">Approved</span>
      </div>
    </div>
  );
}

function VoiceMock() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-card-hover">
      <div className="flex items-center gap-2 text-brand-700">
        <WaveformIcon className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-wide">Listening — Hinglish</span>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="ml-auto max-w-[85%] rounded-2xl bg-brand-700 px-3 py-1.5 text-white">
          Payment fail ho gaya tha, phir try karwa do
        </div>
        <div className="max-w-[85%] rounded-2xl border border-slate-200 px-3 py-1.5 text-slate-700">
          Bilkul, aapke liye payment link bhej raha hoon.
        </div>
      </div>
    </div>
  );
}

function PolicyMock() {
  const rows = ["Max recovery attempts respected", "High-value cases escalated for review", "Opted-out customers never contacted"];
  return (
    <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-card-hover">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Merchant policy</div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm text-slate-700">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutcomeMock() {
  const steps = ["Failed", "Analyzed", "Policy", "Action", "Recovered"];
  return (
    <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-card-hover">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Case timeline</div>
      <div className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full ${i === steps.length - 1 ? "bg-emerald-500" : "bg-brand-300"}`} />
            <span className={`text-sm ${i === steps.length - 1 ? "font-semibold text-emerald-700" : "text-slate-600"}`}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkMock() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-card-hover">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Payment link</span>
        <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-medium text-white">Test Mode</span>
      </div>
      <div className="mt-2.5 truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
        rzp.io/l/pr-8s3kq2m
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircleIcon className="h-4 w-4" />
        Idempotent — never sent twice
      </div>
    </div>
  );
}

const CAPABILITIES = [
  {
    key: "ai",
    icon: SparkleIcon,
    eyebrow: "Decision layer",
    title: "AI Recovery",
    body: "Google Gemini reads the case — amount, root cause, customer history — and recommends the safest intervention. It never acts alone: every recommendation is re-checked by deterministic policy code before anything happens.",
    Mock: DecisionMock,
  },
  {
    key: "links",
    icon: LinkIcon,
    eyebrow: "Execution",
    title: "Payment Links",
    body: "Approved cases get a real Razorpay Test Mode payment link — created through one idempotent path, so a retry or a double-click can never send a customer two links for the same failure.",
    Mock: LinkMock,
  },
  {
    key: "voice",
    icon: MicIcon,
    eyebrow: "The hero feature",
    title: "Voice Recovery",
    body: "A browser-based conversation in natural Hinglish. The customer's intent is classified, mapped to a candidate action, and put through the exact same policy engine as every other channel.",
    Mock: VoiceMock,
  },
  {
    key: "policy",
    icon: ShieldCheckIcon,
    eyebrow: "The boundary",
    title: "Policy Engine",
    body: "Attempt limits, high-value review thresholds, recovery windows, and opt-out behavior — all merchant-controlled, all enforced in code, never left to the AI's judgment alone.",
    Mock: PolicyMock,
  },
  {
    key: "outcome",
    icon: CheckCircleIcon,
    eyebrow: "The proof",
    title: "Outcome Verification",
    body: "Nothing is assumed recovered. Every case's real outcome is confirmed and the full path — detect, analyze, decide, act, confirm — is written to a merchant-scoped audit trail.",
    Mock: OutcomeMock,
  },
];

const REVIEW_BUBBLES = [
  { name: "Rahul", quote: "Payment recovery was quick and effortless.", amount: 2999, label: "Example recovery", style: { top: "8%", left: "8%" } },
  { name: "Priya", quote: "Got a payment link within seconds of my card failing.", amount: 4500, label: "Demo feedback", style: { top: "58%", left: "20%" } },
  { name: "Aman", quote: "The voice call understood my Hinglish perfectly.", amount: 1899, label: "Example recovery", style: { top: "20%", right: "12%" } },
  { name: "Neha", quote: "Didn't even need to open the app to pay.", amount: 6200, label: "Demo feedback", style: { bottom: "10%", right: "22%" } },
];

const FAQ_ITEMS = [
  {
    q: "How does PayRevive recover payments?",
    a: "By sending a Razorpay Test Mode payment link, placing a Hinglish voice call, or escalating to the merchant — whichever intervention the policy engine approves for that case.",
  },
  {
    q: "Does PayRevive make decisions automatically?",
    a: "Gemini recommends an intervention, but nothing executes until deterministic policy code approves it. Money, thresholds, and eligibility are never decided by the AI alone.",
  },
  {
    q: "When does PayRevive escalate?",
    a: "When a case is above the merchant's high-value review threshold, or when policy can't confidently approve an automated action — it's handed to a human instead.",
  },
  {
    q: "Does PayRevive work with Razorpay?",
    a: "Yes — payment links are created through the Razorpay Test Mode API, the same safe, idempotent path for every channel that triggers one.",
  },
  {
    q: "How does the AI voice agent work?",
    a: "The customer speaks naturally in Hinglish in the browser. Gemini classifies the intent, and the same eligibility/policy engine used everywhere else decides what happens next.",
  },
  {
    q: "How is customer data protected?",
    a: "Every query is scoped to the authenticated merchant, no card numbers or CVVs are ever stored, and every state-changing action writes an audit log entry.",
  },
  {
    q: "Can merchants control recovery limits?",
    a: "Yes — maximum recovery attempts, voice attempts, the recovery window, high-value thresholds, and opt-out behavior are all set in Merchant Policy.",
  },
];

function FaqItem({ item, open, onToggle }) {
  return (
    <div className="border-b border-slate-200/80">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-semibold text-brand-900">{item.q}</span>
        <ChevronDownIcon className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pr-8 text-sm leading-relaxed text-slate-500">{item.a}</p>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute -bottom-24 -right-16 select-none text-[28rem] font-bold leading-none text-white/[0.03]" aria-hidden="true">
            ₹
          </span>
          <FloatingCurrency symbol="₹" size="text-7xl" tone="text-white/15" style={{ top: "14%", right: "16%" }} depth={14} floatSpeed={8} />
          <FloatingCurrency symbol="₹" size="text-4xl" tone="text-mint-300/25" style={{ top: "62%", right: "6%" }} depth={10} floatSpeed={6} floatDelay={0.6} />
          <FloatingCurrency symbol="$" size="text-2xl" tone="text-white/15" style={{ top: "30%", right: "34%" }} depth={20} floatSpeed={5.5} floatDelay={1.2} />
          <FloatingCurrency symbol="€" size="text-xl" tone="text-white/10" style={{ top: "72%", right: "30%" }} depth={16} floatSpeed={7.5} floatDelay={0.3} />
          <FloatingCurrency symbol="£" size="text-lg" tone="text-white/10" style={{ top: "44%", right: "10%" }} depth={24} floatSpeed={6.5} floatDelay={1.6} />
          <FloatingMetric icon={<CheckCircleIcon className="h-3 w-3" />} value="₹82,450" label="Example · Recovered" tone="emerald" style={{ top: "20%", right: "6%" }} delay={0.4} className="lg:flex" />
          <FloatingBadge text="AI decision" tone="dark" style={{ top: "78%", right: "18%" }} delay={0.9} />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
          <RevealOnScroll>
            <Eyebrow tone="dark">AI Revenue Recovery</Eyebrow>
          </RevealOnScroll>
          <RevealOnScroll delay={90}>
            <h1 className="mt-6 max-w-3xl text-6xl font-bold leading-[0.98] tracking-tight text-white sm:text-7xl lg:text-8xl">
              Recover revenue
              <span className="block text-mint-300">before it&rsquo;s lost.</span>
            </h1>
          </RevealOnScroll>
          <RevealOnScroll delay={180}>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-mint-100/90">
              PayRevive detects failed payments, decides what is safe to recover, and takes the
              right action — automatically.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delay={270}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <MagneticButton
                as={Link}
                to="/signup"
                className="items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-brand-900 shadow-card-hover hover:bg-mint-50"
              >
                Get Started
                <ArrowRightIcon className="h-4 w-4" />
              </MagneticButton>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                See How It Works
              </Link>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* ===== MARQUEE ===== */}
      <div className="border-y border-slate-200/70 bg-mint-50/60 py-4">
        <Marquee speed={32}>
          {MARQUEE_WORDS.map((w) => (
            <span key={w} className="mx-6 flex items-center gap-6 text-sm font-semibold uppercase tracking-widest text-brand-700">
              {w}
              <span className="text-brand-300" aria-hidden="true">✦</span>
            </span>
          ))}
        </Marquee>
      </div>

      {/* ===== PROBLEM ===== */}
      <section className="mx-auto max-w-6xl px-6 py-24 sm:px-8 sm:py-32">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1fr]">
          <RevealOnScroll>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl">
              Payments fail.
              <span className="block text-slate-400">Revenue shouldn&rsquo;t.</span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-500">
              A declined card doesn&rsquo;t mean a lost customer. Most failures are ordinary,
              recoverable moments — if something notices in time and responds the right way.
            </p>
          </RevealOnScroll>

          <StaggerChildren className="space-y-0" step={80}>
            {FAILURE_CAUSES.map((c) => (
              <div key={c.n} className="flex items-start gap-5 border-b border-slate-100 py-5 first:pt-0 last:border-0">
                <span className="text-sm font-semibold text-slate-300">{c.n}</span>
                <div>
                  <div className="text-base font-semibold text-brand-900">{c.label}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{c.note}</div>
                </div>
              </div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="bg-canvas py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll className="text-center">
            <Eyebrow>The loop</Eyebrow>
            <h2 className="mx-auto mt-5 max-w-xl text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">
              How PayRevive works
            </h2>
          </RevealOnScroll>

          <StaggerChildren className="mt-16 space-y-10" step={100}>
            {STORY_STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3 border-b border-slate-200/70 pb-10 last:border-0 sm:flex-row sm:items-baseline sm:gap-8">
                <span className="text-5xl font-bold text-brand-100 sm:text-6xl">{s.n}</span>
                <div>
                  <div className="text-xl font-bold tracking-tight text-brand-900">{s.title}</div>
                  <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-500">{s.body}</p>
                </div>
              </div>
            ))}
          </StaggerChildren>

          <RevealOnScroll className="mt-10 text-center">
            <Link to="/how-it-works" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
              See the full breakdown
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </RevealOnScroll>
        </div>
      </section>

      {/* ===== CAPABILITIES ===== */}
      <section className="py-8 sm:py-12">
        {CAPABILITIES.map((cap, i) => {
          const Icon = cap.icon;
          const Mock = cap.Mock;
          const reversed = i % 2 === 1;
          return (
            <div key={cap.key} className={i % 2 === 0 ? "bg-white" : "bg-mint-50/40"}>
              <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
                <div className={`flex flex-col items-center gap-12 lg:flex-row lg:gap-20 ${reversed ? "lg:flex-row-reverse" : ""}`}>
                  <RevealOnScroll className="flex-1">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <Eyebrow className="mt-5">{cap.eyebrow}</Eyebrow>
                    <h3 className="mt-4 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{cap.title}</h3>
                    <p className="mt-4 max-w-md text-base leading-relaxed text-slate-500">{cap.body}</p>
                  </RevealOnScroll>
                  <RevealOnScroll delay={120} className="flex flex-1 justify-center">
                    <Mock />
                  </RevealOnScroll>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ===== RECOVERY RESULTS ===== */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center sm:px-8 sm:py-32">
        <RevealOnScroll>
          <Eyebrow>What recovery looks like</Eyebrow>
          <h2 className="mx-auto mt-5 max-w-lg text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">
            Recovery results
          </h2>
          <div className="mt-3 flex items-center justify-center gap-2">
            <DemoTag>Example figures — not live merchant data</DemoTag>
          </div>
        </RevealOnScroll>

        <StaggerChildren className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3" step={100}>
          <div>
            <div className="text-5xl font-bold tracking-tight text-brand-900">₹82,450</div>
            <div className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400">Recovered</div>
          </div>
          <div>
            <div className="text-5xl font-bold tracking-tight text-emerald-600">66.2%</div>
            <div className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400">Recovery rate</div>
          </div>
          <div>
            <div className="text-5xl font-bold tracking-tight text-brand-900">10</div>
            <div className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400">Failed payments</div>
          </div>
        </StaggerChildren>
      </section>

      {/* ===== RECOVERY IN ACTION (case study) ===== */}
      <section className="bg-brand-950 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 sm:px-8">
          <RevealOnScroll className="text-center">
            <Eyebrow tone="dark">Recovery in action</Eyebrow>
            <h2 className="mx-auto mt-5 max-w-md text-4xl font-bold tracking-tight text-white sm:text-5xl">
              One recoverable case, start to finish
            </h2>
            <div className="mt-3 flex justify-center">
              <DemoTag>Example scenario</DemoTag>
            </div>
          </RevealOnScroll>

          <StaggerChildren className="mt-14 space-y-0" step={90}>
            {[
              { label: "Payment failed", value: "₹8,500", tone: "amber" },
              { label: "AI identified a recoverable case", tone: "cyan" },
              { label: "Razorpay Test Mode link sent", tone: "cyan" },
              { label: "Customer paid", tone: "cyan" },
              { label: "₹8,500 recovered", tone: "mint", final: true },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-start gap-5">
                <div className="flex flex-col items-center">
                  <span className={`flex h-3 w-3 shrink-0 rounded-full ${step.final ? "bg-emerald-400" : "bg-white/30"}`} />
                  {i < arr.length - 1 && <span className="my-1 h-10 w-px bg-white/15" />}
                </div>
                <div className="pb-6">
                  <div className={`text-base font-semibold ${step.final ? "text-emerald-300" : "text-white"}`}>
                    {step.value ? `${step.value} — ${step.label}` : step.label}
                  </div>
                </div>
              </div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ===== FLOATING REVIEWS / SOCIAL PROOF ===== */}
      {/* Dark background isn't just rhythm here — FloatingReview's glass-bubble trigger
          (border-white/25 bg-white/10) is designed for a dark/colored backdrop; on a light
          section it renders as a near-invisible white-on-white circle. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-900 to-brand-950 py-32 sm:py-40">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow tone="dark">In their words</Eyebrow>
            <h2 className="mx-auto mt-5 max-w-md text-4xl font-bold tracking-tight text-white sm:text-5xl">
              What recovery feels like
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-mint-100/70">
              Hover a bubble. These are example recoveries used to illustrate the experience —
              not real customer accounts.
            </p>
          </RevealOnScroll>
        </div>

        <div className="pointer-events-none relative mx-auto mt-16 h-64 max-w-4xl">
          {REVIEW_BUBBLES.map((b, i) => (
            <FloatingReview key={b.name} {...b} delay={i * 0.8} />
          ))}
        </div>
      </section>

      {/* ===== PRICING TEASER ===== */}
      <section className="border-y border-slate-200/70 bg-mint-50/50 py-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">Simple, honest pricing</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
              Final pricing isn&rsquo;t set yet — we&rsquo;d rather tell you that plainly than
              make something up.
            </p>
            <Link to="/pricing" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
              See pricing details
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </RevealOnScroll>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="mx-auto max-w-3xl px-6 py-24 sm:px-8 sm:py-32">
        <RevealOnScroll>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-5 text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">Questions, answered</h2>
        </RevealOnScroll>
        <RevealOnScroll delay={100} className="mt-10">
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={item.q} item={item} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? -1 : i)} />
          ))}
        </RevealOnScroll>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 py-28 sm:py-36">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-6xl" tone="text-white/10" style={{ top: "20%", left: "10%" }} depth={12} floatSpeed={7} />
          <FloatingCurrency symbol="$" size="text-3xl" tone="text-mint-300/20" style={{ bottom: "18%", right: "14%" }} depth={18} floatSpeed={6} floatDelay={0.8} />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <h2 className="text-5xl font-bold leading-[1.03] tracking-tight text-white sm:text-6xl">
              Recover the revenue
              <span className="block text-mint-300">you already earned.</span>
            </h2>
            <MagneticButton
              as={Link}
              to="/signup"
              className="mx-auto mt-10 items-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-semibold text-brand-900 shadow-card-hover hover:bg-mint-50"
            >
              Get Started
              <ArrowRightIcon className="h-4 w-4" />
            </MagneticButton>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
