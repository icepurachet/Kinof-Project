import React from "react";

/**
 * Button — the single source of truth for button styling across the app.
 * Replaces the old pattern of every page writing its own <button className="...">.
 *
 * variant:
 *  - "primary"   solid blue gradient — the ONE primary action per screen
 *  - "gold"      solid gold gradient — reserve for a single standout CTA (e.g. hero banners)
 *  - "secondary" white / outline — default for secondary actions, sits next to primary
 *  - "danger"    rose outline — destructive / reject actions
 *  - "success"   solid emerald — positive/accept actions (e.g. accepting an invite) — distinct
 *                from "primary" (blue), which is reserved for the page's forward-progress action
 *  - "ghost"     no border/background — lowest-emphasis actions (e.g. "ย้อนกลับ")
 *
 * size: "sm" | "md" (default) | "lg"
 * icon: a lucide-react icon component; iconPosition: "left" | "right" (default)
 */
const SIZES = {
  sm: { pad: "px-3.5 py-2 text-xs rounded-lg gap-1.5", icon: 13 },
  md: { pad: "px-5 py-2.5 text-xs md:text-sm rounded-xl gap-2", icon: 15 },
  lg: { pad: "px-7 py-3 text-sm rounded-xl gap-2", icon: 17 },
};

const VARIANTS = {
  primary: "text-white bg-brand-gradient shadow-blue-glow hover:brightness-110",
  gold: "text-navy-900 bg-gold-gradient shadow-glow hover:brightness-105 font-semibold",
  secondary: "text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-soft",
  danger: "text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100",
  success: "text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm",
  ghost: "text-slate-500 hover:text-slate-800 hover:bg-slate-100",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "right",
  fullWidth = false,
  className = "",
  ...props
}) {
  const { pad, icon: iconSize } = SIZES[size];

  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${pad} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {Icon && iconPosition === "left" && <Icon size={iconSize} />}
      <span>{children}</span>
      {Icon && iconPosition === "right" && <Icon size={iconSize} />}
    </button>
  );
}