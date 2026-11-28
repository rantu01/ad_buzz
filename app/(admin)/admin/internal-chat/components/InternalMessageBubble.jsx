"use client";

import React from "react";
import { Check, CheckCheck, File, Phone, PhoneOff, Video } from "lucide-react";

function timeOf(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function durationOf(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function InternalMessageBubble({ message, isOwn, conversationId, uid, onRetry }) {
  const m = message || {};
  const type = m.messageType || "text";
  // <img>/<audio> cannot send an Authorization header; the endpoint accepts a
  // uid query param and re-checks conversation membership server-side.
  const attachmentUrl = (id) =>
    `/api/internal-chat/attachments?attachmentId=${encodeURIComponent(id)}&conversationId=${encodeURIComponent(conversationId)}&uid=${encodeURIComponent(uid || "")}`;

  if (type === "call_event") {
    const status = String(m.callMetadata?.status || "");
    const label = status === "missed" ? "Missed call"
      : status === "rejected" ? "Call rejected"
      : "Call ended";
    const Icon = m.callMetadata?.callType === "video" ? Video : Phone;
    const missed = status === "missed" || status === "rejected";
    return (
      <div className="my-3 flex justify-center">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-600">
          <Icon size={14} className={missed ? "text-red-500" : "text-emerald-600"} />
          <span className="font-semibold">{label}</span>
          {!missed && Number(m.callMetadata?.duration) > 0 && (
            <span className="font-mono text-slate-500">{durationOf(m.callMetadata.duration)}</span>
          )}
          <span className="text-slate-400">{timeOf(m.createdAt)}</span>
        </div>
      </div>
    );
  }

  const isVoice = type === "voice";
  return (
    <div className={`mb-3 flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[72%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && (
          <p className="mb-1 px-1 text-xs font-semibold text-slate-600">
            {m.senderNameSnapshot || "Colleague"}
            {m.senderRole && <span className="ml-1 text-[10px] font-normal text-slate-400">· {String(m.senderRole).replace(/_/g, " ")}</span>}
          </p>
        )}
        <div className={`rounded-2xl px-3 py-2 shadow-sm ${isOwn ? "rounded-br-sm bg-orange-500 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-900"}`}>
          {type === "text" && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>}
          {isVoice && (
            <div className="min-w-[180px]">
              {m.attachments?.[0] && (
                <audio controls src={attachmentUrl(m.attachments[0].id)} className="max-w-full" />
              )}
              <p className="mt-1 text-[10px] opacity-80">Voice message · {m.voiceMetadata?.duration || 0}s</p>
            </div>
          )}
          {(type === "image" || type === "file") && (m.attachments?.length || 0) > 0 && (
            <div className="space-y-2">
              {m.attachments.map((a) => (
                type === "image" && a.type?.startsWith("image/") ? (
                  <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={attachmentUrl(a.id)} alt={a.name} loading="lazy" decoding="async" className="max-h-52 max-w-full rounded-lg object-contain" />
                  </a>
                ) : (
                  <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">
                    <File size={14} /> {a.name}
                  </a>
                )
              ))}
              {m.content && <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>}
            </div>
          )}
        </div>
        <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 ${isOwn ? "justify-end" : "justify-start"}`}>
          <span>{timeOf(m.createdAt)}</span>
          {m.status === "sending" && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-orange-500" aria-label="Sending message" />
          )}
          {m.status === "failed" && (
            <button
              type="button"
              onClick={() => onRetry?.(m)}
              className="font-semibold text-red-500 hover:underline"
              aria-label="Retry sending message"
            >
              Retry
            </button>
          )}
          {!m.status && isOwn && ((m.readBy || []).length > 1
            ? <CheckCheck size={12} className="text-blue-500" aria-label="Read" />
            : <Check size={12} aria-label="Sent" />)}
        </div>
      </div>
    </div>
  );
}

export default React.memo(InternalMessageBubble);
