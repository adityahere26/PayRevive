// One consistent icon style across the whole product: outline, 1.75 stroke, round joins,
// 24x24 viewbox. Hand-rolled (not a library) — this is the small, fixed set the app actually
// needs, so it doesn't add an icon-library dependency for a handful of glyphs.

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ children, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden="true">
      {children}
    </svg>
  );
}

export function TrendingUpIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Svg>
  );
}

export function ShieldCheckIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function ClockIcon({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function AlertTriangleIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 4l9 15.5H3z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </Svg>
  );
}

export function CheckCircleIcon({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.4 2.4L15.8 9" />
    </Svg>
  );
}

export function MicIcon({ className }) {
  return (
    <Svg className={className}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0013 0" />
      <path d="M12 17.5V21M9 21h6" />
    </Svg>
  );
}

export function FileTextIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M7 3.5h7l4 4V20a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" />
      <path d="M14 3.5V8h4.2" />
      <path d="M9 13h6M9 16.5h6" />
    </Svg>
  );
}

export function SettingsIcon({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 000-3l1.1-1.6-1.7-1.7-1.6 1.1a1.7 1.7 0 00-3 0L13.5 6H10.5l-.7 1.9a1.7 1.7 0 00-3 0L5.2 6.9 3.5 8.6l1.1 1.6a1.7 1.7 0 000 3L3.5 14.8l1.7 1.7 1.6-1.1a1.7 1.7 0 003 0l.7 1.9h3l.7-1.9a1.7 1.7 0 003 0l1.6 1.1 1.7-1.7z" />
    </Svg>
  );
}

export function ArrowLeftIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </Svg>
  );
}

export function RefreshIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" />
      <path d="M18 4v4h-4M6 20v-4h4" />
    </Svg>
  );
}

export function InboxIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M4 12.5l2.5-7.5h11l2.5 7.5" />
      <path d="M4 12.5h5l1.3 2.5h3.4l1.3-2.5h5V19a.8.8 0 01-.8.8H4.8a.8.8 0 01-.8-.8z" />
    </Svg>
  );
}

export function PhoneIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M5.5 4h3l1.5 4-2 1.3a11 11 0 005.7 5.7L14 13l4 1.5v3a1.5 1.5 0 01-1.6 1.5A15 15 0 014 5.6 1.5 1.5 0 015.5 4z" />
    </Svg>
  );
}

export function LinkIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M10 14a4.5 4.5 0 001.3.9l1.4.5a4.5 4.5 0 003.8-8.1l-1.2-.9" />
      <path d="M14 10a4.5 4.5 0 00-1.3-.9l-1.4-.5a4.5 4.5 0 00-3.8 8.1l1.2.9" />
      <path d="M9.5 14.5l5-5" />
    </Svg>
  );
}

export function UsersIcon({ className }) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0111 0" />
      <path d="M15.5 6.2a3 3 0 010 5.6" />
      <path d="M17.5 13.5a5 5 0 013.2 4.8" />
    </Svg>
  );
}

export function XIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function ArrowRightIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  );
}

export function ChevronDownIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function MenuIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function WaveformIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M22 12h-1" />
    </Svg>
  );
}

export function SparkleIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 4l1.4 4.2L17.6 9.6 13.4 11l-1.4 4.2L10.6 11 6.4 9.6l4.2-1.4z" />
      <path d="M18.5 15.5l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" />
    </Svg>
  );
}
