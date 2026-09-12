import React from "react";
import { GRADIENT_PRIMARY } from "../theme";

/**
 * Card
 * - "default": standard white card (most content)
 * - "flat": no shadow, just a border — nested/inline groupings
 * - "accent": subtle blue top border — highlighted/featured cards
 * - "spotlight": full gradient background, white text — hero-style callouts
 * - hoverable: lifts + upgrades shadow on hover (clickable cards only)
 */
export default function Card({
  children,
  className = "",
  style = {},
  variant = "default",
  hoverable = false,
  ...props
}) {
  const base = "rounded-2xl transition-all duration-200";

  const variants = {
    default: "bg-white border border-slate-200/80 shadow-soft",
    flat: "bg-white border border-slate-200/80",
    accent: "bg-white border border-slate-200/80 shadow-soft border-t-[3px] border-t-navy-800",
    spotlight: "bg-brand-gradient text-white border border-navy-700/30 shadow-blue-glow",
  };

  const hoverStyles = hoverable
    ? "hover:border-slate-300 hover:shadow-card hover:-translate-y-0.5 cursor-pointer"
    : "";

  return (
    <div
      className={`${base} ${variants[variant]} ${hoverStyles} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}