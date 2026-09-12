import React from "react";

const TONES = {
  gray: "bg-slate-100 text-slate-700 border-slate-200/60",
  amber: "bg-amber-50 text-amber-800 border-amber-200/60",
  blue: "bg-blue-50 text-blue-800 border-blue-200/60",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200/60",
  red: "bg-rose-50 text-rose-800 border-rose-200/60",
  purple: "bg-purple-50 text-purple-800 border-purple-200/60",
  navy: "bg-navy-50 text-navy-800 border-navy-100",
  teal: "bg-teal-50 text-teal-500/90 border-teal-500/20",
  gold: "bg-gold-50 text-gold-600 border-gold-500/25",
};

const DOT_TONES = {
  gray: "bg-slate-400",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-rose-500",
  purple: "bg-purple-500",
  navy: "bg-navy-800",
  teal: "bg-teal-500",
  gold: "bg-gold-500",
};

export default function Pill({ children, tone = "gray", withDot = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border leading-none ${TONES[tone]} ${className}`}
    >
      {withDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_TONES[tone]}`} />}
      {children}
    </span>
  );
}