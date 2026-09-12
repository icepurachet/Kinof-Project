import React from "react";
import { LogOut, X } from "lucide-react";
import { GRADIENT_PRIMARY, GRADIENT_GOLD } from "../theme";

/**
 * Sidebar
 * Desktop (lg+): always visible, static.
 * Mobile (<lg): overlay drawer — pass `isOpen` + `onClose` from the parent
 * together with a menu button that calls setIsOpen(true) (see TopBar's onMenuClick).
 */
export default function Sidebar({
  items,
  page,
  setPage,
  roleLabel,
  onLogout,
  isOpen = false,
  onClose = () => {},
}) {
  const handleSelect = (key) => {
    setPage(key);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-40 lg:hidden animate-fade-in"
        />
      )}

      <aside
        className={`w-72 lg:w-64 shrink-0 text-white flex flex-col justify-between py-6 px-4 min-h-screen select-none
          fixed inset-y-0 left-0 z-50 lg:static lg:z-20 shadow-2xl lg:shadow-xl
          transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ background: GRADIENT_PRIMARY }}
      >
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base text-navy-900 shadow-glow transition-transform hover:scale-105"
                style={{ background: GRADIENT_GOLD }}
              >
                KN
              </div>
              <div>
                <div className="font-bold tracking-wider text-base leading-tight">KINOF</div>
                <div className="text-[11px] text-white/60 font-light tracking-wide">{roleLabel || "ระบบจองห้องแล็บ"}</div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="lg:hidden text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
              aria-label="ปิดเมนู"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1.5">
            {items.map((it) => {
              const isActive = page === it.key;
              return (
                <button
                  key={it.key}
                  onClick={() => handleSelect(it.key)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 relative group ${
                    isActive
                      ? "text-white bg-white/15 shadow-sm shadow-black/10"
                      : "text-white/65 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full"
                      style={{ background: GRADIENT_GOLD }}
                    />
                  )}
                  <it.icon
                    size={19}
                    className={`transition-colors ${isActive ? "text-gold-400" : "text-white/60 group-hover:text-white/90"}`}
                  />
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs md:text-sm font-medium text-white/60 hover:text-rose-200 hover:bg-rose-500/15 transition-all duration-200 mt-6"
        >
          <LogOut size={18} />
          <span>ออกจากระบบ</span>
        </button>
      </aside>
    </>
  );
}