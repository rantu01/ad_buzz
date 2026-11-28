"use client";

import React from "react";

export default function ChatDateSeparator({ value }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label = date.toDateString() === today.toDateString()
    ? "Today"
    : date.toDateString() === yesterday.toDateString()
      ? "Yesterday"
      : date.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="my-3 flex justify-center" aria-label={label}>
      <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{label}</span>
    </div>
  );
}
