import { useState } from "react";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ChevronDownIcon } from "../../components/ui/icons.jsx";

const CONTACT_EMAIL = "team@payrevive.dev";

const FAQS = [
  {
    q: "What does PayRevive recover?",
    a: "Revenue from failed payments and abandoned checkouts — PayRevive detects the at-risk revenue, diagnoses why it failed, and takes a bounded, policy-checked action (a payment link or a voice call) to try to recover it.",
  },
  {
    q: "Does PayRevive move real money?",
    a: "In this build, payment links run on Razorpay Test Mode — no real money moves. The recovery logic, policy checks, and audit trail are the same code that would run in production.",
  },
  {
    q: "How does Razorpay integration work?",
    a: "PayRevive calls Razorpay's Payment Links API through one shared, idempotent code path — the same one every channel (voice, web, escalation) uses, so a link is never created or sent twice for the same case.",
  },
  {
    q: "How does PayRevive decide what to do?",
    a: "PayRevive classifies voice intent and recommends an intervention, but that recommendation is advisory. A deterministic policy engine — not the recommendation — checks attempt limits, thresholds, and eligibility before anything executes.",
  },
  {
    q: "How does PayRevive know when to stop?",
    a: "Merchant policy sets maximum recovery attempts, a recovery window, and opt-out rules. Once a case hits any of those limits, or the customer opts out, outreach stops — enforced by policy, not by an advisory recommendation.",
  },
  {
    q: "Is the demo data real?",
    a: "No. Synthetic and evaluation data is generated deterministically and always labeled as such in the UI and API — it's never presented as real merchant activity.",
  },
];

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className="border-b border-brand-100">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 py-5 text-left" aria-expanded={isOpen}>
        <span className="text-base font-semibold text-brand-900 sm:text-lg">{item.q}</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-brand-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid overflow-hidden transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <p className="min-h-0 max-w-xl text-sm leading-relaxed text-slate-500">{item.a}</p>
      </div>
    </div>
  );
}

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | unavailable
  const [openFaq, setOpenFaq] = useState(0);

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    // Honest by design: this preview build has no contact-form backend to send to. Rather than
    // fake a success state, show a brief "sending" moment and then say so plainly, with a real
    // way to actually reach someone.
    window.setTimeout(() => setStatus("unavailable"), 500);
  }

  return (
    <div>
      <section className="bg-canvas py-24 sm:py-32">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-16 px-6 sm:px-8 lg:grid-cols-[1.1fr,1fr] lg:items-start lg:gap-20">
          <RevealOnScroll>
            <Eyebrow>Contact</Eyebrow>
            <h1 className="mt-6 text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[0.98] tracking-tight text-brand-900">Talk to us.</h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-500">
              Questions about policy, or how PayRevive fits your checkout — reach out directly,
              or use the live demo to see it running first.
            </p>
          </RevealOnScroll>

          <RevealOnScroll delay={100}>
            <form onSubmit={handleSubmit} className="space-y-6">
              <label className="block">
                <span className="label-mono block text-[11px] uppercase text-brand-400">Name</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-2 w-full border-0 border-b border-brand-200 bg-transparent px-0 py-2 text-brand-900 focus:border-brand-950 focus:outline-none focus:ring-0"
                />
              </label>
              <label className="block">
                <span className="label-mono block text-[11px] uppercase text-brand-400">Email</span>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-2 w-full border-0 border-b border-brand-200 bg-transparent px-0 py-2 text-brand-900 focus:border-brand-950 focus:outline-none focus:ring-0"
                />
              </label>
              <label className="block">
                <span className="label-mono block text-[11px] uppercase text-brand-400">Message</span>
                <textarea
                  required
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  className="mt-2 w-full resize-none border-0 border-b border-brand-200 bg-transparent px-0 py-2 text-brand-900 focus:border-brand-950 focus:outline-none focus:ring-0"
                />
              </label>
              <Button type="submit" disabled={status === "sending"} className="w-full sm:w-auto">
                {status === "sending" ? "Sending…" : "Send message"}
              </Button>
            </form>

            {status === "unavailable" && (
              <div className="mt-6">
                <Alert tone="info" title="This preview build doesn't send messages yet">
                  Email us directly at{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-2">
                    {CONTACT_EMAIL}
                  </a>{" "}
                  and we&rsquo;ll get back to you.
                </Alert>
              </div>
            )}
          </RevealOnScroll>
        </div>
      </section>

      <section className="border-t border-brand-100 bg-white py-24 sm:py-28">
        <div className="mx-auto max-w-3xl px-6 sm:px-8">
          <RevealOnScroll>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-5 max-w-md text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">Questions, answered plainly</h2>
          </RevealOnScroll>
          <div className="mt-14 border-t border-brand-100">
            {FAQS.map((item, i) => (
              <FaqItem key={item.q} item={item} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? -1 : i)} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
