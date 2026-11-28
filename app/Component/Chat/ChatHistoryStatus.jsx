"use client";

import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Top-of-thread status shared by all chat pages: an indeterminate indicator
 * while an older page is fetched and a clear end-of-history marker otherwise.
 * Render it inside the scrollable message container, above the messages.
 */
export default function ChatHistoryStatus({ loadingOlder = false, showBeginning = false }) {
  if (loadingOlder) {
    return (
      <div className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500" role="status" aria-live="polite">
        <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading earlier messages...
      </div>
    );
  }
  if (showBeginning) {
    return (
      <div className="mb-3 text-center text-[11px] text-slate-400" role="status">
        Beginning of conversation
      </div>
    );
  }
  return null;
}
