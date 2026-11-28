"use client";

import React from "react";
import { ArrowDown } from "lucide-react";

/**
 * Floating "Scroll to latest" affordance shared by every chat thread.
 * Render it inside a `relative` wrapper around the scrollable message list.
 */
export default function ScrollToLatestButton({ visible, onClick, label = "Scroll to latest message" }) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 motion-reduce:transition-none"
    >
      <ArrowDown size={16} strokeWidth={2.25} aria-hidden="true" />
      <span>Scroll to latest</span>
    </button>
  );
}
