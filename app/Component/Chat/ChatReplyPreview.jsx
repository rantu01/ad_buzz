"use client";

import React from "react";
import { Reply } from "lucide-react";

export function replyDescription(message) {
  const type = message?.messageType || "text";
  if (type === "image") return message?.content || "Photo";
  if (type === "file") return message?.content || message?.attachments?.[0]?.name || "Document";
  if (type === "voice") return "Voice message";
  if (type === "call_event") return message?.content || "Call";
  return String(message?.content || "Message").slice(0, 100);
}

export default function ChatReplyPreview({ message, onClick, onCancel, compact = false }) {
  if (!message) return null;
  const preview = (
    <>
      <Reply size={14} aria-hidden="true" />
      <span className="min-w-0 flex-1 border-l-2 border-current pl-2 text-left">
        <span className="block truncate text-xs font-semibold">{message.senderNameSnapshot || "Message"}</span>
        <span className="block truncate text-xs opacity-75">{replyDescription(message)}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full min-w-0 items-center gap-2 rounded-md bg-black/5 px-2 py-1 text-slate-600 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${compact ? "mb-1" : ""}`}
        aria-label={`Jump to message from ${message.senderNameSnapshot || "unknown sender"}: ${replyDescription(message)}`}
      >
        {preview}
      </button>
    );
  }

  return (
    <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border-l-2 border-orange-500 bg-slate-50 px-2 py-1.5 text-slate-700">
      {preview}
      {onCancel && (
        <button type="button" onClick={onCancel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label="Cancel reply">
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
