import React from "react";
import { Menu } from "lucide-react";
import { GRADIENT_GOLD } from "../theme";

/**
 * TopBar
 * `onMenuClick` is optional — pass it (e.g. () => setSidebarOpen(true) in
 * App.jsx) to reveal a hamburger button on mobile that opens Sidebar's drawer.
 */
export default function TopBar({ name = "ผู้ใช้งาน", onMenuClick }) {
  return (
    <div className="flex items-center justify-between mb-6 pb-2">
      {onMenuClick ? (
        <button
          onClick={onMenuClick}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200/80 text-slate-600 shadow-sm hover:border-slate-300 transition-colors"
          aria-label="เปิดเมนู"
        >
          <Menu size={18} />
        </button>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-full pl-1.5 pr-4 py-1 shadow-sm hover:border-slate-300 hover:shadow-soft transition-all">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-navy-900 text-xs font-bold shadow-sm"
          style={{ background: GRADIENT_GOLD }}
        >
          {name[0]}
        </div>
        <span className="text-xs font-medium text-slate-700">{name}</span>
      </div>
    </div>
  );
}