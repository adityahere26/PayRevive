import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import {
  ArrowRightIcon,
  SparkleIcon,
  LinkIcon,
  MicIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from "../../components/ui/icons.jsx";

const SOLUTIONS = [
  {
    icon: SparkleIcon,
    title: "AI Recovery Decisions",
    body: "Every failed payment is scored for recovery probability and matched to a candidate intervention by PayRevive's planner — advisory only, never final.",
    points: ["Root-cause classification", "Deterministic recovery scoring", "Advisory intervention selection"],
  },
  {
    icon: LinkIcon,
    title: "Razorpay Payment Links",
    body: "Approved cases get a real Razorpay Test Mode payment link, created through one idempotent path shared by every channel that can trigger one.",
    points: ["One safe, shared code path", "Idempotent — never sent twice", "Test Mode only, by design"],
  },
  {
    icon: MicIcon,
    title: "Hinglish Voice Recovery",
    body: "A live, browser-based conversation in natural Hinglish. The customer's intent is classified and run through the same eligibility and policy checks as every other channel.",
    points: ["Natural Hinglish conversation", "Same policy engine as text", "Text fallback for any browser"],
  },
  {
    icon: ShieldCheckIcon,
    title: "Merchant Policy Engine",
    body: "Attempt limits, high-value review thresholds, recovery windows, and opt-out behavior — configured per merchant, enforced deterministically on every single action.",
    points: ["Max recovery / voice attempts", "High-value escalation threshold", "Opt-out always respected"],
  },
  {
    icon: CheckCircleIcon,
    title: "Outcome Verification & Audit",
    body: "Nothing is assumed recovered. Every case's real outcome is confirmed, and the entire path from detection to confirmation is written to a merchant-scoped audit log.",
    points: ["Real outcomes, never assumed", "Full explainable timeline", "Merchant-isolated audit trail"],
  },
];

export default function Solutions() {
  return (
    <div>
      <section className="bg-canvas py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow>Solutions</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-xl text-5xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-6xl">
              Everything revenue recovery needs — nothing it doesn&rsquo;t.
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-slate-500">
              Five capabilities, one deterministic pipeline underneath all of them.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section>
        {SOLUTIONS.map((s, i) => {
          const Icon = s.icon;
          const reversed = i % 2 === 1;
          return (
            <div key={s.title} className={i % 2 === 0 ? "bg-white" : "bg-mint-50/40"}>
              <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
                <div className={`flex flex-col items-start gap-10 lg:flex-row lg:items-center lg:gap-20 ${reversed ? "lg:flex-row-reverse" : ""}`}>
                  <RevealOnScroll className="flex-1">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 className="mt-5 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{s.title}</h2>
                    <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-500">{s.body}</p>
                  </RevealOnScroll>
                  <RevealOnScroll delay={120} className="flex-1">
                    <ul className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                      {s.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </RevealOnScroll>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="border-t border-slate-200/70 py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 text-center sm:px-8">
          <RevealOnScroll>
            <h2 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">Ready to see it work?</h2>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-800">
                Get Started
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link to="/demo" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-brand-800 hover:bg-mint-50">
                View live demo
              </Link>
            </div>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
