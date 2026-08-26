import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client.js";
import { Button } from "../components/ui/Button.jsx";
import { FloatingCurrency } from "../components/floating/FloatingCurrency.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";

// SPEC.md § Demo mode: evaluators should never need to register. This is the only working
// auth flow in the Day 2 foundation — real merchant login isn't built yet.
export default function DemoEntry() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState(null);

  async function handleEnterDemo() {
    setStatus("loading");
    setError(null);
    try {
      const { token } = await api.authDemo();
      setToken(token);
      navigate("/dashboard");
    } catch (err) {
      setStatus("error");
      setError(err.message);
      return;
    }
    setStatus("idle");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-950 px-6 py-16">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <FloatingCurrency symbol="₹" size="text-9xl" tone="text-white/5" style={{ top: "-8%", left: "4%" }} depth={8} />
        <FloatingCurrency symbol="₹" size="text-2xl" tone="border-mint-300/30 text-mint-300" style={{ top: "20%", right: "14%" }} depth={16} circle />
        <FloatingCurrency symbol="$" size="text-lg" tone="border-white/15 text-white/50" style={{ bottom: "18%", left: "12%" }} depth={20} floatDelay={0.6} circle />
        <FloatingCurrency symbol="£" size="text-base" tone="border-white/10 text-white/25" style={{ bottom: "10%", right: "22%" }} depth={24} floatDelay={1.2} circle />
      </div>

      <RevealOnScroll className="relative w-full max-w-md text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-950">P</span>
        <p className="label-mono mt-5 text-[11px] text-mint-300">PayRevive · Live Demo</p>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
          Recover revenue
          <br />
          before it&rsquo;s lost.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-white/60">
          Detect revenue at risk. Recover what can be recovered. Stop when it should.
        </p>

        <Button onClick={handleEnterDemo} disabled={status === "loading"} className="mt-9 w-full" size="lg">
          {status === "loading" ? "Entering demo…" : "Enter Demo"}
        </Button>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <p className="label-mono mt-6 text-[10px] text-white/30">
          Pre-seeded demo merchant · Razorpay Test Mode · Synthetic data only
        </p>
      </RevealOnScroll>
    </div>
  );
}
