// One button system for the whole product. `buttonClasses()` is exported separately so a
// react-router <Link> can look exactly like a <button> without a polymorphic wrapper.

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS = {
  primary: "bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900",
  secondary: "bg-white text-brand-800 border border-slate-200 shadow-sm hover:bg-mint-50 hover:border-brand-200",
  tertiary: "text-brand-700 hover:text-brand-900 hover:bg-mint-50",
  destructive: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const SIZES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export function buttonClasses({ variant = "primary", size = "md", className = "" } = {}) {
  return `${BASE} ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }) {
  return <button type="button" className={buttonClasses({ variant, size, className })} {...props} />;
}
