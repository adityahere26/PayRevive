import { ParallaxElement } from "../motion/ParallaxElement.jsx";
import { FloatingCurrency } from "./FloatingCurrency.jsx";
import { TransferPath } from "./TransferPath.jsx";
import { CheckCircleIcon } from "../ui/icons.jsx";

// Premium animated financial scene (brief §1) for the "How PayRevive works" section's empty
// lower-left — a failed payment (left) traveling to a recovered outcome (right) via
// TransferPath's curved glow trail, never a literal flowchart/labels. Purely decorative
// (aria-hidden, pointer-events-none) and self-contained — one absolutely-positioned composition
// a caller drops into a `position: relative` empty area.
export function MoneyTransferAnimation({ className = "" }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <ParallaxElement depth={6} className="relative h-full w-full">
        {/* ambient glow — background depth (brief §6), stays well inside the section's fill */}
        <div
          className="absolute -inset-6 rounded-[2.5rem] opacity-70"
          style={{ background: "radial-gradient(60% 60% at 30% 70%, rgb(139 187 146 / 0.16) 0%, transparent 70%), radial-gradient(50% 50% at 80% 20%, rgb(18 84 79 / 0.14) 0%, transparent 70%)" }}
        />

        <TransferPath className="absolute inset-0 h-full w-full" />

        {/* sender — failed payment, left */}
        <div className="absolute flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/50 bg-white/70 text-amber-700 shadow-[0_10px_20px_-8px_rgba(9,35,40,0.35)] backdrop-blur-sm sm:h-10 sm:w-10" style={{ left: "3%", top: "73%" }}>
          <span className="text-sm font-bold sm:text-base">₹</span>
        </div>

        {/* receiver — recovered revenue, right */}
        <div
          className="absolute flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_12px_24px_-8px_rgba(9,35,40,0.4)] sm:h-11 sm:w-11"
          style={{ left: "89%", top: "9%", background: "radial-gradient(circle at 32% 28%, #8bbb92 0%, #2a835f 55%, #12544f 100%)" }}
        >
          <CheckCircleIcon className="h-5 w-5" />
        </div>

        {/* a couple of small coins/notes drifting loosely near the path — "small payment
            notes/cards/coins following the path" without being literally pinned to it */}
        <FloatingCurrency symbol="₹" size="text-sm" coin coinTone="secondary" drift="up-fade" floatSpeed={6} depth={4} style={{ left: "36%", top: "58%" }} />
        <FloatingCurrency symbol="$" size="text-xs" coin coinTone="primary" drift="diagonal-a" floatSpeed={7.5} floatDelay={0.8} depth={5} style={{ left: "62%", top: "30%" }} />
      </ParallaxElement>
    </div>
  );
}
