import { useId } from "react";
import { usePrefersReducedMotion } from "../motion/useReducedMotion.js";

// A single curved sender -> receiver path with a soft glow trail and a few small particles
// (coins/notes) traveling along it via native SVG <animateMotion> — no animation library, no
// canvas, just SMIL, which every browser this product targets already supports. Used by
// MoneyTransferAnimation. viewBox is a fixed 320x160 "scene" that the parent scales to fit.
const PATH_D = "M 20 126 C 110 150, 210 10, 300 26";

// Hand-picked points near the curve (see index.css/this file's comments for how they were
// derived) — used only when motion is reduced, so the trail still reads as a trail without any
// animation running (brief §8: "show only very subtle static objects").
const STATIC_POINTS = [
  { x: 89, y: 118, r: 3.5 },
  { x: 160, y: 79, r: 4 },
  { x: 231, y: 38, r: 3 },
];

const PARTICLES = [
  { r: 4, dur: 5.5, begin: 0, shape: "circle", tone: "#8bbb92" },
  { r: 3, dur: 6.2, begin: 1.8, shape: "circle", tone: "#2a835f" },
  { r: 3.2, dur: 5.8, begin: 3.4, shape: "note", tone: "#cfe9d7" },
];

export function TransferPath({ className = "" }) {
  const reduced = usePrefersReducedMotion();
  const uid = useId();
  const pathId = `pr-transfer-path${uid}`;
  const gradId = `pr-transfer-grad${uid}`;
  const glowId = `pr-transfer-glow${uid}`;

  return (
    <svg viewBox="0 0 320 160" className={className} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#12544f" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#8bbb92" stopOpacity="0.9" />
        </linearGradient>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      {/* soft glow trail */}
      <path d={PATH_D} fill="none" stroke={`url(#${gradId})`} strokeWidth="7" strokeLinecap="round" filter={`url(#${glowId})`} opacity="0.4" />
      {/* crisp dotted curve */}
      <path id={pathId} d={PATH_D} fill="none" stroke={`url(#${gradId})`} strokeWidth="1.5" strokeDasharray="1 8" strokeLinecap="round" opacity="0.65" />

      {reduced
        ? STATIC_POINTS.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={PARTICLES[i]?.tone || "#8bbb92"} opacity="0.55" />)
        : PARTICLES.map((p, i) =>
            p.shape === "note" ? (
              <rect key={i} x={-3.5} y={-2.5} width={7} height={5} rx={1.2} fill={p.tone} opacity="0">
                <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.15;0.85;1" dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
              </rect>
            ) : (
              <circle key={i} r={p.r} fill={p.tone} opacity="0">
                <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.15;0.85;1" dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
              </circle>
            )
          )}
    </svg>
  );
}
