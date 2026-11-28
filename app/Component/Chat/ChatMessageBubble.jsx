"use client";

import React, { useRef, useState } from "react";
import { Check, CheckCheck, Play, Reply } from "lucide-react";
import ChatMediaAttachment from "./ChatMediaAttachment";
import MessageReactions from "./MessageReactions";
import ChatReplyPreview from "./ChatReplyPreview";
import ChatParticipantAvatar from "./ChatParticipantAvatar";

function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(d) {
  const date = toValidDate(d);
  if (!date) return "";
  try {
    // Match the reference UI: "10:20 am" rather than "10:20 AM".
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s*(AM|PM)\s*$/i, (_match, period) => ` ${period.toLowerCase()}`);
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

function MessageMeta({ time, canReply, onReply, message, onRetry }) {
  const { status, readBy } = message;
  return (
    <div className="chat-msg-meta">
      <span>{time}</span>
      {canReply && (
        <button type="button" onClick={() => onReply(message)} className="chat-msg-action" aria-label="Reply to message">
          <Reply size={13} aria-hidden="true" />
        </button>
      )}
      {status === "sending" && (
        <span className="chat-msg-spinner" aria-label="Sending message" />
      )}
      {status === "failed" && (
        <button type="button" onClick={() => onRetry?.(message)} className="chat-msg-retry" aria-label="Retry sending message">Retry</button>
      )}
      {!["sending", "failed"].includes(status) && message.isOwn && ((readBy || []).length > 1
        ? <CheckCheck size={12} className="text-blue-500" aria-label="Read" />
        : <Check size={12} aria-label="Sent" />)}
    </div>
  );
}

function ChatMessageBubble({ message, isOwn, senderOnline = false, onRetry, onReply, onJumpToMessage, highlighted = false, uid, onReact }) {
  const m = message || {};
  const type = m.messageType || "text";
  const time = formatTime(m.createdAt);
  const canReply = Boolean(onReply && m.messageId && !String(m.messageId).startsWith("tmp_") && m.status !== "sending");
  const pointerStartRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event) => {
    if (event.target.closest("button, a, input, audio, video")) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerUp = (event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    setDragging(false);
    if (!canReply || !start || Math.abs(event.clientY - start.y) > 40) return;
    const delta = event.clientX - start.x;
    if (Math.abs(delta) >= 64) onReply?.(m);
  };

  if (type === "system_event") {
    return (
      <div data-message-id={m.messageId} className="flex justify-center my-2">
        {m.replyTo && <ChatReplyPreview message={m.replyTo} onClick={() => onJumpToMessage?.(m.replyTo.messageId)} compact />}
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          {normalizeText(m.content) || type}
        </span>
        {canReply && <button type="button" onClick={() => onReply(m)} className="chat-msg-action !opacity-100" aria-label="Reply to message"><Reply size={14} /></button>}
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
      <div data-message-id={m.messageId} className="flex justify-center px-2 py-1 my-2">
        <div className="max-w-full rounded-2xl bg-slate-100 px-4 py-2 text-center text-xs text-slate-600 shadow-sm">
          {m.replyTo && <ChatReplyPreview message={m.replyTo} onClick={() => onJumpToMessage?.(m.replyTo.messageId)} compact />}
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
          {canReply && <button type="button" onClick={() => onReply(m)} className="chat-msg-event-reply" aria-label="Reply to message"><Reply size={13} /> Reply</button>}
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-msg-row ${isOwn ? "chat-msg-row--out" : "chat-msg-row--in"}`}>
      {!isOwn && (
        <div className="chat-msg-avatar">
          <ChatParticipantAvatar
            person={{ displayName: m.senderNameSnapshot, avatar: m.senderAvatar }}
            size="h-8 w-8"
            online={senderOnline}
          />
        </div>
      )}
      <div
        data-message-id={m.messageId}
        className={`chat-msg-content ${highlighted ? "chat-msg-content--highlighted" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          if (pointerStartRef.current && Math.abs(event.clientX - pointerStartRef.current.x) > Math.abs(event.clientY - pointerStartRef.current.y) && Math.abs(event.clientX - pointerStartRef.current.x) > 12) setDragging(true);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartRef.current = null; setDragging(false); }}
        style={{ touchAction: "pan-y" }}
      >
        <div className="chat-msg-bubble">
          {m.replyTo && <ChatReplyPreview message={m.replyTo} onClick={() => onJumpToMessage?.(m.replyTo.messageId)} compact />}
          {type === "text" && (
            <p className="chat-msg-text">
              {String(m.content || "").split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
                /^https?:\/\//i.test(part)
                  ? <a key={`${index}-${part}`} href={part.replace(/[.,!?;:]+$/, "")} target="_blank" rel="noreferrer">{part}</a>
                  : part
              )}
            </p>
          )}
          {(type === "image" || type === "file") && m.attachments?.length ? (
            <div className="space-y-1">
              {m.attachments.map((a) => (
                <ChatMediaAttachment
                  key={a.id}
                  message={m}
                  attachment={a}
                  buildUrl={(attachment) => `/api/user/chat/attachments?attachmentId=${encodeURIComponent(attachment.id)}&uid=${encodeURIComponent(m.senderId || "")}`}
                />
              ))}
              {m.content && <p className="chat-msg-text mt-1">{m.content}</p>}
            </div>
          ) : null}
          {type === "voice" && (
            <div className="flex items-center gap-2 min-w-[180px] max-w-full">
              <button className="rounded-full bg-white/20 p-1.5" aria-label="play">
                <Play size={14} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="h-1 rounded bg-white/30" />
                <div className="mt-1 text-[10px] opacity-80">{m.voiceMetadata?.duration || 0}s</div>
              </div>
            </div>
          )}
          {type === "voice" && m.attachments?.length ? (
            <audio controls src={`/api/user/chat/attachments?attachmentId=${m.attachments[0].id}&uid=${m.senderId}`} className="mt-1 w-full" />
          ) : null}
          {onReact && !String(m.messageId || "").startsWith("tmp_") && (
            <MessageReactions reactions={m.reactions} uid={uid} align={isOwn ? "right" : "left"} onReact={(emoji) => onReact(m, emoji)} />
          )}
        </div>
        <MessageMeta
          time={time}
          canReply={canReply}
          onReply={onReply}
          onRetry={onRetry}
          message={{ ...m, isOwn }}
        />
        {dragging && canReply && <span className="chat-msg-drag-hint" aria-live="polite"><Reply size={13} /> Release to reply</span>}
      </div>
    </div>
  );
}

export default React.memo(ChatMessageBubble);
