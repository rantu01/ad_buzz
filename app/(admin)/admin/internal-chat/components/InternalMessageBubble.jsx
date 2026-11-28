"use client";

import React, { useRef, useState } from "react";
import { Check, CheckCheck, Phone, Reply, Video } from "lucide-react";
import ChatMediaAttachment from "@/app/Component/Chat/ChatMediaAttachment";
import MessageReactions from "@/app/Component/Chat/MessageReactions";
import ChatReplyPreview from "@/app/Component/Chat/ChatReplyPreview";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";

function timeOf(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s*(AM|PM)\s*$/i, (_match, period) => ` ${period.toLowerCase()}`);
}

function durationOf(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function InternalMessageBubble({ message, isOwn, senderOnline = false, conversationId, uid, onRetry, onReply, onJumpToMessage, highlighted = false, onReact, showSenderName = false }) {
  const m = message || {};
  const type = m.messageType || "text";
  const canReply = Boolean(onReply && m.messageId && !String(m.messageId).startsWith("tmp_") && m.status !== "sending");
  const pointerStartRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  // <img>/<audio> cannot send an Authorization header; the endpoint accepts a
  // uid query param and re-checks conversation membership server-side.
  const attachmentUrl = (id) =>
    `/api/internal-chat/attachments?attachmentId=${encodeURIComponent(id)}&conversationId=${encodeURIComponent(conversationId)}&uid=${encodeURIComponent(uid || "")}`;
  const onPointerDown = (event) => {
    if (event.target.closest("button, a, input, audio, video")) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = (event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    setDragging(false);
    if (canReply && start && Math.abs(event.clientY - start.y) <= 40 && Math.abs(event.clientX - start.x) >= 64) onReply?.(m);
  };

  if (type === "call_event") {
    const status = String(m.callMetadata?.status || "");
    const label = status === "missed" ? "Missed call"
      : status === "rejected" ? "Call rejected"
      : "Call ended";
    const Icon = m.callMetadata?.callType === "video" ? Video : Phone;
    const missed = status === "missed" || status === "rejected";
    return (
      <div data-message-id={m.messageId} className="my-3 flex justify-center">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-600">
          <Icon size={14} className={missed ? "text-red-500" : "text-emerald-600"} />
          <span className="font-semibold">{label}</span>
          {!missed && Number(m.callMetadata?.duration) > 0 && (
            <span className="font-mono text-slate-500">{durationOf(m.callMetadata.duration)}</span>
          )}
          <span className="text-slate-400">{timeOf(m.createdAt)}</span>
          {canReply && <button type="button" onClick={() => onReply(m)} className="chat-msg-action !opacity-100" aria-label="Reply to message"><Reply size={14} /></button>}
        </div>
      </div>
    );
  }

  const isVoice = type === "voice";
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
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStartRef.current = null; setDragging(false); }}
        onPointerMove={(event) => {
          if (pointerStartRef.current && Math.abs(event.clientX - pointerStartRef.current.x) > Math.abs(event.clientY - pointerStartRef.current.y) && Math.abs(event.clientX - pointerStartRef.current.x) > 12) setDragging(true);
        }}
        style={{ touchAction: "pan-y" }}
      >
        <div className="chat-msg-bubble">
          {showSenderName && !isOwn && (
            <p className="mb-0.5 text-[11px] font-semibold text-orange-600">{m.senderNameSnapshot || "Member"}</p>
          )}
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
          {isVoice && (
            <div className="min-w-[180px] max-w-full">
              {m.attachments?.[0] && (
                <audio controls src={attachmentUrl(m.attachments[0].id)} className="w-full" />
              )}
              <p className="chat-msg-text mt-1 opacity-80">Voice message · {m.voiceMetadata?.duration || 0}s</p>
            </div>
          )}
          {(type === "image" || type === "file") && (m.attachments?.length || 0) > 0 && (
            <div className="space-y-1">
              {m.attachments.map((a) => (
                <ChatMediaAttachment
                  key={a.id}
                  message={m}
                  attachment={a}
                  buildUrl={(attachment) => attachmentUrl(attachment.id)}
                />
              ))}
              {m.content && <p className="chat-msg-text mt-1">{m.content}</p>}
            </div>
          )}
          {onReact && !String(m.messageId || "").startsWith("tmp_") && (
            <MessageReactions reactions={m.reactions} uid={uid} align={isOwn ? "right" : "left"} onReact={(emoji) => onReact(m, emoji)} />
          )}
        </div>
        <div className="chat-msg-meta">
          <span>{timeOf(m.createdAt)}</span>
          {canReply && (
            <button type="button" onClick={() => onReply(m)} className="chat-msg-action" aria-label="Reply to message">
              <Reply size={13} aria-hidden="true" />
            </button>
          )}
          {m.status === "sending" && (
            <span className="chat-msg-spinner" aria-label="Sending message" />
          )}
          {m.status === "failed" && (
            <button type="button" onClick={() => onRetry?.(m)} className="chat-msg-retry" aria-label="Retry sending message">Retry</button>
          )}
          {!["sending", "failed"].includes(m.status) && isOwn && ((m.readBy || []).length > 1
            ? <CheckCheck size={12} className="text-blue-500" aria-label="Read" />
            : <Check size={12} aria-label="Sent" />)}
        </div>
        {dragging && canReply && <span className="chat-msg-drag-hint" aria-live="polite"><Reply size={13} /> Release to reply</span>}
      </div>
    </div>
  );
}

export default React.memo(InternalMessageBubble);
