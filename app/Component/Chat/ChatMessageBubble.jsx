"use client";

import React from "react";
import { Check, CheckCheck, File, Play } from "lucide-react";

function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(d) {
  const date = toValidDate(d);
  if (!date) return "";
  try {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Repairs UTF-8 text that was decoded as Latin-1 at some point in the
// pipeline (for example "Â·" instead of "·"). Only applies to system
// generated strings, so customer supplied text is never touched.
function normalizeText(value) {
  let s = String(value || "");
  if (!/[\u00C2\u00C3\u00E2]/.test(s)) return s;
  for (let pass = 0; pass < 3; pass += 1) {
    if (!/[\u00C2\u00C3\u00E2]/.test(s)) break;
    try {
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i += 1) {
        const code = s.charCodeAt(i);
        if (code > 0xff) return s;
        bytes[i] = code;
      }
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break;
    }
  }
  return s.replace(/\uFFFD/g, "");
}

const CALL_STATUS_LABELS = {
  ended: "Call ended",
  missed: "Missed call",
  rejected: "Call rejected",
  accepted: "Call connected",
  connected: "Call connected",
  calling: "Calling",
  ringing: "Ringing",
};

function callStatusLabel(meta, content) {
  const key = String(meta.status || "").toLowerCase();
  if (CALL_STATUS_LABELS[key]) return CALL_STATUS_LABELS[key];
  const text = normalizeText(content);
  const known = Object.values(CALL_STATUS_LABELS).find((label) => text.toLowerCase().includes(label.toLowerCase()));
  return known || (key ? key.replace(/_/g, " ") : "Call");
}

function ChatMessageBubble({ message, isOwn, showSender = true, onRetry }) {
  const m = message || {};
  const type = m.messageType || "text";
  const time = formatTime(m.createdAt);

  if (type === "system_event") {
    return (
      <div className="flex justify-center my-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          {normalizeText(m.content) || type}
        </span>
      </div>
    );
  }

  if (type === "call_event") {
    const meta = m.callMetadata || {};
    const statusLabel = callStatusLabel(meta, m.content);
    const isMissed = /missed/i.test(statusLabel);
    const isRejected = /rejected/i.test(statusLabel);
    const isCompleted = !isMissed && !isRejected;

    const endedAtDate = toValidDate(meta.endedAt) || toValidDate(m.createdAt);
    const startedAtDate = toValidDate(meta.startedAt);

    let duration = Number(meta.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      if (startedAtDate && endedAtDate) {
        duration = Math.max(0, Math.round((endedAtDate.getTime() - startedAtDate.getTime()) / 1000));
      }
    }

    return (
      <div className="flex justify-center px-2 py-1 my-2">
        <div className="max-w-full rounded-2xl bg-slate-100 px-4 py-2 text-center text-xs text-slate-600 shadow-sm">
          <div className="font-semibold text-slate-700">
            <span>{statusLabel}</span>
          </div>
          {isCompleted && duration > 0 && (
            <div className="mt-0.5 text-slate-600">
              <span className="text-slate-500">Duration </span>
              <span className="font-mono tracking-tight">{formatDuration(duration)}</span>
            </div>
          )}
          {endedAtDate && (
            <div className="mt-0.5 text-[10px] leading-4 text-slate-400">
              {isCompleted && startedAtDate ? (
                <>
                  <span>Started {formatTime(startedAtDate)}</span>
                  <span aria-hidden="true">{" · "}</span>
                  <span>Ended {formatTime(endedAtDate)}</span>
                </>
              ) : (
                <span>Ended {formatTime(endedAtDate)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const bubbleBase = isOwn
    ? "bg-orange-500 text-white rounded-2xl rounded-br-sm"
    : "bg-white text-slate-900 rounded-2xl rounded-bl-sm border border-slate-200";

  return (
    <div className={`flex gap-2 mb-3 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn && showSender && (
        <div className="flex-shrink-0">
          {m.senderAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.senderAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
              {(m.senderNameSnapshot || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}
      <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && showSender && (
          <div className="mb-1 text-xs font-semibold text-slate-600">
            {m.senderNameSnapshot}
            {m.senderRole && m.senderRole !== "customer" && (
              <span className="ml-1 text-[10px] font-normal text-slate-400">· {String(m.senderRole).replace(/_/g, " ")}</span>
            )}
          </div>
        )}
        <div className={`px-3 py-2 shadow-sm ${bubbleBase}`}>
          {type === "text" && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
          )}
          {type === "image" && m.attachments?.length ? (
            <div className="space-y-1">
              {m.attachments.map((a) => (
                <a key={a.id} href={`/api/user/chat/attachments?attachmentId=${a.id}&uid=${m.senderId}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/user/chat/attachments?attachmentId=${a.id}&uid=${m.senderId}`} alt={a.name} className="max-h-48 rounded-lg" />
                </a>
              ))}
              {m.content && <p className="mt-1 text-sm">{m.content}</p>}
            </div>
          ) : null}
          {type === "file" && m.attachments?.length ? (
            <div className="space-y-1">
              {m.attachments.map((a) => (
                <a key={a.id} href={`/api/user/chat/attachments?attachmentId=${a.id}&uid=${m.senderId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">
                  <File size={14} /> {a.name} <span className="text-[10px] opacity-70">({Math.round((a.size||0)/1024)}KB)</span>
                </a>
              ))}
              {m.content && <p className="mt-1 text-sm">{m.content}</p>}
            </div>
          ) : null}
          {type === "voice" && (
            <div className="flex items-center gap-2 min-w-[180px]">
              <button className="rounded-full bg-white/20 p-1.5" aria-label="play">
                <Play size={14} />
              </button>
              <div className="flex-1">
                <div className="h-1 rounded bg-white/30" />
                <div className="mt-1 text-[10px] opacity-80">{m.voiceMetadata?.duration || 0}s</div>
              </div>
            </div>
          )}
          {type === "voice" && m.attachments?.length ? (
            <audio controls src={`/api/user/chat/attachments?attachmentId=${m.attachments[0].id}&uid=${m.senderId}`} className="mt-1 max-w-full" />
          ) : null}
        </div>
        <div className={`mt-1 flex items-center gap-1 text-[10px] text-slate-400 ${isOwn ? "justify-end" : "justify-start"}`}>
          <span>{time}</span>
          {m.status === "sending" && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-orange-500" aria-label="Sending message" />
          )}
          {m.status === "failed" && (
            <button type="button" onClick={() => onRetry?.(m)} className="font-semibold text-red-500 hover:underline" aria-label="Retry sending message">Retry</button>
          )}
          {!m.status && isOwn && (m.readBy && m.readBy.length > 1
            ? <CheckCheck size={12} className="text-blue-500" />
            : <Check size={12} />)}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ChatMessageBubble);
