// One button system for the whole product. `buttonClasses()` is exported separately so a
// react-router <Link> can look exactly like a <button> without a polymorphic wrapper.
//
// Pill shape + hairline treatment (design system migration — see CLAUDE.md / session brief):
// primary is the vivid green accent (the one place solid color dominates a control), secondary
// is a hairline-bordered hollow pill that fills faintly on hover, tertiary is text-only.

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium tracking-tight transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS = {
  primary: "bg-emerald-500 text-brand-950 hover:bg-emerald-400 active:bg-emerald-600",
  secondary: "bg-transparent text-brand-900 border border-brand-200 hover:border-brand-400 hover:bg-brand-50",
  tertiary: "text-brand-700 hover:text-brand-950 hover:bg-brand-50",
  destructive: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const SIZES = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-sm",
};

export function buttonClasses({ variant = "primary", size = "md", className = "" } = {}) {
  return `${BASE} ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }) {
  return <button type="button" className={buttonClasses({ variant, size, className })} {...props} />;
}
