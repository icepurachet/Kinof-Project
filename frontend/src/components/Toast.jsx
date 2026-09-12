import React, { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export default function Toast({ text, onDone }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [text, onDone]);

  if (!text) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900/95 text-white backdrop-blur-md px-4 py-3 shadow-2xl border border-slate-800 text-xs md:text-sm animate-toast-in max-w-[90vw]"
    >
      <CheckCircle2 size={18} className="text-teal-500 shrink-0" />
      <span className="font-normal text-slate-100">{text}</span>
    </div>
  );
}