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

export function SparkleIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 4l1.4 4.2L17.6 9.6 13.4 11l-1.4 4.2L10.6 11 6.4 9.6l4.2-1.4z" />
      <path d="M18.5 15.5l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" />
    </Svg>
  );
}
