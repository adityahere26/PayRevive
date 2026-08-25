import { AlertTriangleIcon, CheckCircleIcon, InboxIcon, SparkleIcon } from "./icons.jsx";

// One alert/banner system — replaces the ad-hoc red/amber boxes each page used to hand-roll.

const TONES = {
  danger: { wrap: "border-red-200 bg-red-50 text-red-700", icon: AlertTriangleIcon, iconClass: "text-red-500" },
  warning: { wrap: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangleIcon, iconClass: "text-amber-500" },
  success: { wrap: "border-brand-200 bg-mint-50 text-brand-800", icon: CheckCircleIcon, iconClass: "text-brand-600" },
  info: { wrap: "border-mint-200 bg-mint-50 text-brand-800", icon: SparkleIcon, iconClass: "text-brand-600" },
  neutral: { wrap: "border-slate-200 bg-slate-50 text-slate-600", icon: InboxIcon, iconClass: "text-slate-400" },
};

export function Alert({ tone = "neutral", title, children, action }) {
  const t = TONES[tone] || TONES.neutral;
  const Icon = t.icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${t.wrap}`}>
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${t.iconClass}`} />
      <div className="flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={title ? "mt-0.5 text-[13px] opacity-90" : "text-[13px]"}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
