import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { StaggerChildren } from "../../components/motion/StaggerChildren.jsx";
import { Marquee } from "../../components/motion/Marquee.jsx";
import { MagneticButton } from "../../components/motion/MagneticButton.jsx";
import { HeroReveal } from "../../components/motion/HeroReveal.jsx";
import { usePrefersReducedMotion } from "../../components/motion/useReducedMotion.js";
import { FloatingCurrency } from "../../components/floating/FloatingCurrency.jsx";
import { FloatingReview } from "../../components/floating/FloatingReview.jsx";
import { FloatingMetric } from "../../components/floating/FloatingMetric.jsx";
import { FloatingBadge } from "../../components/floating/FloatingBadge.jsx";
import { PaymentCard3D } from "../../components/floating/PaymentCard3D.jsx";
import { MoneyStack } from "../../components/floating/MoneyStack.jsx";
import { PaymentLinkCard } from "../../components/floating/PaymentLinkCard.jsx";
import { RecoveryFlowVisual } from "../../components/floating/RecoveryFlowVisual.jsx";
import { MoneyTransferAnimation } from "../../components/floating/MoneyTransferAnimation.jsx";
import { FloatingCoinField } from "../../components/floating/FloatingCoinField.jsx";
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

// The public marketing landing page. Section rhythm is deliberate — dark/gradient/white
// sections alternate on purpose (index.css § Gradient system) instead of one flat white page,
// and the fail -> AI acts -> recovered story is told through a recurring visual object
// (PaymentCard3D) as well as through copy, per the design brief. No stock imagery — every
// decorative element is a hand-built CSS component (client/src/components/floating/).
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

const CARD_STATES = ["failed", "progress", "recovered"];
const CARD_STATE_LABEL = { failed: "Payment failed", progress: "AI recovery in progress", recovered: "Payment recovered" };

// The signature fail -> recover moment (brief §8), told through PayRevive's one recurring
// card object rather than three separate illustrations.
function RecoveryCycle() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(reduced ? 2 : 0);

  useEffect(() => {
    if (reduced) return undefined;
    const id = setInterval(() => setI((v) => (v + 1) % CARD_STATES.length), 2400);
    return () => clearInterval(id);
  }, [reduced]);

  const state = CARD_STATES[i];
  return (
    <div className="relative flex flex-col items-center gap-6">
      <PaymentCard3D amount={2999} state={state} size="md" rotate={-6} depth={10} />
      <div className="label-mono flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-700">
        <span className={`h-1.5 w-1.5 rounded-full ${state === "recovered" ? "bg-accent" : state === "progress" ? "bg-secondary" : "bg-amber-500"}`} />
        {CARD_STATE_LABEL[state]}
      </div>
    </div>
  );
}

function DecisionMock() {
  return (
    <div className="w-full max-w-xs hairline-light rounded-2xl border bg-white p-5 shadow-card-hover">
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
    <div className="w-full max-w-xs hairline-light rounded-2xl border bg-white p-5 shadow-card-hover">
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
    <div className="w-full max-w-xs hairline-light rounded-2xl border bg-white p-5 shadow-card-hover">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Merchant policy</div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm text-slate-700">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-900" />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkMock() {
  return (
    <div className="w-full max-w-xs hairline-light rounded-2xl border bg-white p-5 shadow-card-hover">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Payment link</span>
        <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-medium text-white">Test Mode</span>
      </div>
      <div className="mt-2.5 truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
        rzp.io/l/pr-8s3kq2m
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-brand-900">
        <CheckCircleIcon className="h-4 w-4" />
        Idempotent — never sent twice
      </div>
    </div>
  );
}

function OutcomeMock() {
  const steps = ["Failed", "Analyzed", "Policy", "Action", "Recovered"];
  return (
    <div className="w-full max-w-xs hairline-light rounded-2xl border bg-white p-5 shadow-card-hover">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Case timeline</div>
      <div className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full ${i === steps.length - 1 ? "bg-brand-950" : "bg-brand-300"}`} />
            <span className={`text-sm ${i === steps.length - 1 ? "font-semibold text-brand-950" : "text-slate-600"}`}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CAPABILITIES = [
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
    <div className="hairline-light border-b">
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
      {/* ===== HERO — deep blue-green / green atmospheric gradient ===== */}
      <section className="gradient-deep glow-field relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute -bottom-24 -right-16 select-none text-[28rem] font-bold leading-none text-white/[0.04]" aria-hidden="true">
            ₹
          </span>

          {/* Fail → recover narrative, told spatially: failure signal upper-left, AI decision
              mid-composition, the card + recovered outcome resolve right — asymmetric, not
              centered (brief §5/§6). */}
          <HeroReveal style={{ top: "14%", left: "5%" }} delay={0.5}>
            <FloatingBadge text="Payment failed" tone="amber" className="lg:inline-block" />
          </HeroReveal>
          <HeroReveal style={{ top: "27%", left: "13%" }} delay={0.8} className="hidden sm:block">
            <FloatingCurrency symbol="₹" size="text-2xl" coin coinTone="deep" style={{}} depth={18} floatSpeed={6} />
          </HeroReveal>

          <HeroReveal style={{ top: "45%", left: "38%" }} delay={1.1} className="hidden lg:block">
            <FloatingBadge text="AI decision" tone="dark" />
          </HeroReveal>

          <HeroReveal style={{ top: "8%", right: "6%" }} delay={0.9} className="hidden md:block">
            <PaymentCard3D amount={2999} state="recovered" size="lg" rotate={-9} depth={12} />
          </HeroReveal>
          <HeroReveal style={{ bottom: "6%", right: "12%" }} delay={1.5} className="hidden lg:block">
            <MoneyStack depth={16} />
          </HeroReveal>
          <HeroReveal style={{ top: "6%", right: "34%" }} delay={1.0} className="hidden lg:block">
            <FloatingCurrency symbol="$" size="text-2xl" coin coinTone="secondary" style={{}} depth={20} floatSpeed={5.5} floatDelay={1.2} />
          </HeroReveal>
          <HeroReveal style={{ top: "62%", right: "30%" }} delay={1.3} className="hidden lg:block">
            <FloatingCurrency symbol="€" size="text-xl" coin coinTone="primary" style={{}} depth={16} floatSpeed={7.5} floatDelay={0.3} />
          </HeroReveal>
          <HeroReveal style={{ top: "72%", right: "6%" }} delay={1.6} className="hidden md:block">
            <FloatingCurrency symbol="£" size="text-lg" coin coinTone="secondary" style={{}} depth={24} floatSpeed={6.5} floatDelay={1.6} />
          </HeroReveal>
          <HeroReveal style={{ top: "-2%", right: "-2%" }} delay={1.2} className="hidden lg:block">
            <FloatingMetric icon={<CheckCircleIcon className="h-3 w-3" />} value="₹82,450" label="Example · Recovered" tone="emerald" />
          </HeroReveal>
          <PaymentLinkCard amount={2999} style={{ bottom: "10%", left: "2%" }} depth={22} rotate={-5} className="hidden xl:block" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-28 pt-24 sm:px-8 sm:pb-36 sm:pt-32">
          <RevealOnScroll>
            <Eyebrow tone="dark">AI Revenue Recovery</Eyebrow>
          </RevealOnScroll>
          <RevealOnScroll delay={90}>
            <h1 className="mt-7 max-w-4xl text-7xl font-semibold leading-[0.94] tracking-normal text-white sm:text-8xl lg:text-9xl">
              Recover revenue
              <span className="block text-accent-light">before it&rsquo;s lost.</span>
            </h1>
          </RevealOnScroll>
          <RevealOnScroll delay={180}>
            <p className="mt-8 max-w-lg text-lg leading-relaxed text-white/70">
              PayRevive detects failed payments, decides what is safe to recover, and takes the
              right action — automatically.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delay={270}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <MagneticButton as={Link} to="/signup" className="items-center gap-2 rounded-full border border-white bg-white px-6 py-3.5 text-sm font-semibold text-brand-950 hover:bg-transparent hover:text-white">
                Get Started
                <ArrowRightIcon className="h-4 w-4" />
              </MagneticButton>
              <Link
                to="/how-it-works"
                className="hairline-dark inline-flex items-center gap-2 rounded-full border bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                See How It Works
              </Link>
            </div>
          </RevealOnScroll>
        </div>
        <div className="gradient-transition-deep-teal h-16 w-full" aria-hidden="true" />
      </section>

      {/* ===== MARQUEE — transitional strip ===== */}
      <div className="hairline-light border-y bg-mint-50/60 py-4">
        <Marquee speed={32}>
          {MARQUEE_WORDS.map((w) => (
            <span key={w} className="mx-6 flex items-center gap-6 text-sm font-semibold uppercase tracking-widest text-brand-700">
              {w}
              <span className="text-brand-300" aria-hidden="true">✦</span>
            </span>
          ))}
        </Marquee>
      </div>

      {/* ===== PROBLEM / PRODUCT STORY — white, not empty: a full 3D recovery visualization ===== */}
      <section className="relative overflow-hidden bg-white py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-[20rem]" tone="text-primary/[0.03]" style={{ bottom: "-10%", left: "-6%" }} depth={6} floatSpeed={10} />
        </div>
        <div className="relative mx-auto max-w-6xl px-6 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1fr]">
            <div>
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

              <StaggerChildren className="mt-10 space-y-0" step={80}>
                {FAILURE_CAUSES.map((c) => (
                  <div key={c.n} className="flex items-start gap-5 hairline-light border-b py-5 first:pt-0 last:border-0">
                    <span className="text-sm font-semibold text-slate-300">{c.n}</span>
                    <div>
                      <div className="text-base font-semibold text-brand-900">{c.label}</div>
                      <div className="mt-0.5 text-sm text-slate-500">{c.note}</div>
                    </div>
                  </div>
                ))}
              </StaggerChildren>
            </div>

            <RevealOnScroll delay={140} className="relative flex justify-center py-8 lg:justify-end">
              <div className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] bg-gradient-to-br from-mint-50 via-white to-mint-100" aria-hidden="true" />
              <FloatingCurrency symbol="₹" size="text-lg" coin coinTone="secondary" className="hidden sm:block" style={{ top: "4%", right: "10%" }} depth={10} floatSpeed={5.5} />
              <RecoveryCycle />
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS — soft blue-green gradient ===== */}
      <section className="gradient-soft-teal overflow-hidden py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[40%_53%] lg:gap-16">
            <div className="relative flex h-full flex-col">
              <RevealOnScroll>
                <Eyebrow>The loop</Eyebrow>
                <h2 className="mt-5 max-w-xs text-4xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl">
                  How PayRevive works
                </h2>
                <Link
                  to="/how-it-works"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900"
                >
                  See the full breakdown
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </RevealOnScroll>

              {/* Sits in normal flow directly below the heading/CTA (not absolutely
                  positioned) so it can never overlap them, and so the browser naturally makes
                  room for it at every breakpoint instead of relying on this column's grid-row
                  stretch (which only exists once the 2-column split kicks in at lg). The parent
                  grid gives this left column a fixed 40% of the section at lg, the steps column
                  53%, leaving a full 4rem/64px gutter between them. Width is exactly `w-full`
                  with no scale-up, so the scene never spills past its 40% column into that
                  gutter or the numbered steps — it reads as a self-contained visual block
                  centred in the left half. At lg `my-auto` floats it to the vertical middle of
                  the otherwise-empty left column, with generous top spacing under the heading. */}
              <MoneyTransferAnimation className="mt-10 h-72 w-full sm:mt-12 sm:h-80 md:h-96 lg:my-auto lg:mt-14 lg:h-[34rem]" />
            </div>

            <StaggerChildren className="space-y-10" step={100}>
              {STORY_STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3 border-b border-brand-900/10 pb-10 last:border-0 sm:flex-row sm:items-baseline sm:gap-8">
                  <span className="text-5xl font-bold text-brand-900/15 sm:text-6xl">{s.n}</span>
                  <div>
                    <div className="text-xl font-bold tracking-tight text-brand-900">{s.title}</div>
                    <p className="mt-2 max-w-xl text-base leading-relaxed text-brand-700/80">{s.body}</p>
                  </div>
                </div>
              ))}
            </StaggerChildren>
          </div>
        </div>
      </section>

      {/* ===== AI RECOVERY — white with 3D objects (first capability gets its own stage) ===== */}
      <section className="relative overflow-hidden bg-white py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-3xl" coin coinTone="primary" style={{ top: "10%", right: "10%" }} depth={14} floatSpeed={7} />
          <FloatingCurrency symbol="₹" size="text-xl" coin coinTone="secondary" style={{ bottom: "12%", right: "26%" }} depth={20} floatSpeed={6} floatDelay={0.6} />
        </div>
        <div className="relative mx-auto max-w-6xl px-6 sm:px-8">
          <div className="flex flex-col items-center gap-14 lg:flex-row lg:gap-20">
            <RevealOnScroll className="flex-1">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-950 text-white">
                <SparkleIcon className="h-5 w-5" />
              </span>
              <Eyebrow className="mt-5">Decision layer</Eyebrow>
              <h3 className="mt-4 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">AI Recovery</h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-slate-500">
                Google Gemini reads the case — amount, root cause, customer history — and
                recommends the safest intervention. It never acts alone: every recommendation is
                re-checked by deterministic policy code before anything happens.
              </p>
            </RevealOnScroll>
            <RevealOnScroll delay={120} className="relative flex flex-1 justify-center">
              <MoneyStack className="absolute -left-4 -top-6 hidden lg:block" depth={10} />
              <DecisionMock />
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* ===== METRICS — light green / white gradient, numbers dominant ===== */}
      <section className="gradient-mint-wash relative overflow-hidden py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-2xl" coin coinTone="primary" style={{ top: "14%", left: "8%" }} depth={16} floatSpeed={6.5} />
          <FloatingCurrency symbol="$" size="text-lg" coin coinTone="secondary" style={{ bottom: "18%", right: "10%" }} depth={20} floatSpeed={7} floatDelay={0.8} />
        </div>
        <div className="relative mx-auto max-w-6xl px-6 sm:px-8">
          <RevealOnScroll className="max-w-md">
            <Eyebrow>What recovery looks like</Eyebrow>
            <h2 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl">
              Recovery results
            </h2>
            <div className="mt-4">
              <DemoTag>Example figures — not live merchant data</DemoTag>
            </div>
          </RevealOnScroll>

          <StaggerChildren className="mt-16 flex flex-wrap items-end gap-x-16 gap-y-10" step={100}>
            <div>
              <div className="text-8xl font-bold leading-none tracking-tight text-brand-950 sm:text-9xl">₹82,450</div>
              <div className="mt-3 text-sm font-medium uppercase tracking-wide text-brand-600">Recovered</div>
            </div>
            <div>
              <div className="text-5xl font-bold leading-none tracking-tight text-brand-900 sm:text-6xl">66.2%</div>
              <div className="mt-3 text-sm font-medium uppercase tracking-wide text-brand-600">Recovery rate</div>
            </div>
            <div>
              <div className="text-5xl font-bold leading-none tracking-tight text-brand-900 sm:text-6xl">10</div>
              <div className="mt-3 text-sm font-medium uppercase tracking-wide text-brand-600">Failed payments</div>
            </div>
          </StaggerChildren>
        </div>
      </section>

      {/* ===== DARK CONTRAST — #092328, dramatic, one case study start to finish ===== */}
      <section className="gradient-deep relative overflow-hidden py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-[24rem]" tone="text-white/[0.03]" style={{ top: "-15%", left: "-8%" }} depth={4} floatSpeed={11} />
        </div>
        <div className="relative mx-auto grid max-w-5xl grid-cols-1 gap-12 px-6 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <RevealOnScroll>
            <Eyebrow tone="dark">Recovery in action</Eyebrow>
            <h2 className="mt-5 max-w-sm text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Recover what
              <span className="block text-accent-light">can be recovered.</span>
            </h2>
            <div className="mt-4">
              <DemoTag>Example scenario</DemoTag>
            </div>

            <div className="mt-10 space-y-0">
              {[
                { label: "Payment failed", value: "₹8,500", tone: "amber" },
                { label: "AI identified a recoverable case" },
                { label: "Razorpay Test Mode link sent" },
                { label: "Customer paid" },
                { label: "₹8,500 recovered", final: true },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-start gap-5">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-3 w-3 shrink-0 rounded-full ${step.final ? "bg-accent-light" : "bg-white/30"}`} />
                    {i < arr.length - 1 && <span className="my-1 h-9 w-px bg-white/15" />}
                  </div>
                  <div className="pb-5">
                    <div className={`text-base font-semibold ${step.final ? "text-accent-light" : "text-white/70"}`}>
                      {step.value ? `${step.value} — ${step.label}` : step.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={140} className="relative flex items-center justify-center">
            <PaymentCard3D amount={8500} state="recovered" size="lg" rotate={5} depth={14} />
          </RevealOnScroll>
        </div>
      </section>

      {/* ===== AI RECOVERY FLOW — soft blue-green gradient, animated pipeline ===== */}
      <section className="gradient-soft-teal py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll className="max-w-lg">
            <Eyebrow>The pipeline</Eyebrow>
            <h2 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl">
              Watch a recovery decide itself
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-brand-700/80">
              Every case moves through the same five deterministic stages — nothing skips a
              step, and nothing executes until policy approves it.
            </p>
          </RevealOnScroll>
          <div className="mt-16">
            <RecoveryFlowVisual tone="light" />
          </div>
        </div>
      </section>

      {/* ===== PRODUCT FEATURES — remaining capabilities, alternating, asymmetric ===== */}
      <section className="py-8 sm:py-12">
        {CAPABILITIES.map((cap, i) => {
          const Icon = cap.icon;
          const Mock = cap.Mock;
          const reversed = i % 2 === 1;
          return (
            <div key={cap.key} className={`relative overflow-hidden ${i % 2 === 0 ? "bg-white" : "bg-mint-50/40"}`}>
              {i % 2 === 1 && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <FloatingCurrency symbol="₹" size="text-2xl" coin coinTone="primary" style={{ top: "16%", left: "6%" }} depth={16} floatSpeed={6} />
                </div>
              )}
              <div className="relative mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
                <div className={`flex flex-col items-center gap-12 lg:flex-row lg:gap-20 ${reversed ? "lg:flex-row-reverse" : ""}`}>
                  <RevealOnScroll className="flex-1">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-950 text-white">
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

      {/* ===== FLOATING REVIEWS / SOCIAL PROOF ===== */}
      <section className="gradient-atmosphere glow-field relative overflow-hidden py-32 sm:py-40">
        <FloatingCoinField />

        <div className="relative mx-auto max-w-3xl px-6 sm:px-8">
          <RevealOnScroll>
            <Eyebrow>In their words</Eyebrow>
            <h2 className="mt-5 max-w-md text-4xl font-bold leading-[1.05] tracking-tight text-brand-950 sm:text-5xl">
              What recovery feels like
            </h2>
            <p className="mt-4 max-w-md text-sm text-brand-500">
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

      {/* ===== FINAL CTA — deep blue-green/green gradient ===== */}
      <section className="gradient-brand relative overflow-hidden py-32 sm:py-40">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-6xl" tone="text-white/10" style={{ top: "20%", left: "10%" }} depth={12} floatSpeed={7} />
          <FloatingCurrency symbol="₹" size="text-2xl" coin coinTone="secondary" style={{ top: "66%", left: "18%" }} depth={16} floatSpeed={5} floatDelay={0.3} />
          <FloatingCurrency symbol="$" size="text-xl" coin coinTone="primary" style={{ bottom: "20%", right: "16%" }} depth={18} floatSpeed={6} floatDelay={0.8} />
          <FloatingCurrency symbol="£" size="text-lg" tone="text-white/15" circle circleClassName="border-white/20" style={{ top: "22%", right: "24%" }} depth={20} floatSpeed={7.5} floatDelay={1.1} />
          <PaymentCard3D amount={2999} state="recovered" size="sm" rotate={7} depth={14} className="absolute hidden xl:block" style={{ bottom: "8%", left: "4%" }} />
          <FloatingBadge text="Recovered" tone="emerald" style={{ top: "10%", right: "8%" }} delay={0.5} />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 sm:px-8">
          <RevealOnScroll>
            <h2 className="max-w-3xl text-6xl font-semibold leading-[0.96] tracking-normal text-white sm:text-7xl lg:text-8xl">
              Stop losing revenue
              <span className="block text-accent-light">to failed payments.</span>
            </h2>
            <MagneticButton
              as={Link}
              to="/signup"
              className="mt-10 items-center gap-2 rounded-full border border-white bg-white px-7 py-4 text-sm font-semibold text-brand-950 transition-colors hover:bg-transparent hover:text-white"
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
