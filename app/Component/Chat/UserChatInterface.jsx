"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Video, Info, MoreVertical, X } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import ChatMessageBubble from "@/app/Component/Chat/ChatMessageBubble";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";
import ChatComposer from "@/app/Component/Chat/ChatComposer";
import { useCentralCall } from "@/app/Component/Chat/CentralCallProvider";
import useSSE from "@/app/Component/Hooks/useSSE";
import useChatScroll from "@/app/Component/Hooks/useChatScroll";
import useChatPagination from "@/app/Component/Hooks/useChatPagination";
import ScrollToLatestButton from "@/app/Component/Chat/ScrollToLatestButton";
import ChatHistoryStatus from "@/app/Component/Chat/ChatHistoryStatus";
import ChatInfoPanel from "@/app/Component/Chat/ChatInfoPanel";
import ChatDateSeparator from "@/app/Component/Chat/ChatDateSeparator";
import { CHAT_PAGE_SIZE, mergeOlderMessages, upsertMessage } from "@/lib/chatPagination";
import { setActiveConversation } from "@/lib/activeChat";
import { ROLE_LABELS } from "@/lib/rbacCatalog";

// Role keys come from the live user record on the message (senderRole). Fall
// back to a readable form for custom/dynamic roles rather than assuming a fixed
// label such as "Admin".
function senderRoleLabel(role) {
  const key = String(role || "").toLowerCase();
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  return key.split(/[_\s-]+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function HelpSections() {
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Your team</h3>
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="" className="h-10 w-10 rounded-full object-cover" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Ad Buzz</p>
            <p className="text-xs text-slate-500">Support team</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Hours: every day, all day</p>
        <p className="text-xs text-slate-500">You are talking to Ad Buzz.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Open for you</h3>
        <p className="mt-2 text-xs text-slate-500">Nothing is open for you. Questions you ask here, and tickets you raise, show up here.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">More help</h3>
        <div className="mt-3 space-y-2">
          <a href="/user-dashboard/support-tickets" className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Your tickets</p>
            <p className="text-xs text-slate-500">See replies on the issues you raised.</p>
          </a>
          <Link href="/help-center" className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Help Center</p>
            <p className="text-xs text-slate-500">Quick answers to common questions.</p>
          </Link>
        </div>
      </div>
    </>
  );
}

export default function UserChatInterface({ compact = false, showSenderIdentity = false, showHelpMenu = false }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const listRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const messagesRef = useRef(messages);
  const replyToRef = useRef(replyTo);
  const pendingPayloadRef = useRef(new Map());
  const conversationIdRef = useRef(null);

  const fetchPage = useCallback(async ({ before, limit }) => {
    const url = `/api/user/chat/messages?uid=${encodeURIComponent(uid)}&limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || "Could not load messages");
    return data;
  }, [uid]);

  const {
    hasOlder,
    loadingOlder,
    applyPage,
    loadOlder,
  } = useChatPagination({
    key: conversation?.conversationId || uid,
    fetchPage,
    enabled: Boolean(uid),
  });

  const handleLoadOlder = useCallback(async () => {
    const older = await loadOlder();
    if (older?.length) setMessages((prev) => mergeOlderMessages(prev, older));
  }, [loadOlder]);

  const { showScrollToLatest, handleScroll, scrollToLatest, pinToBottom, bottomRef } = useChatScroll({
    listRef,
    messages,
    conversationKey: conversation?.conversationId || uid,
    loading,
    onLoadOlder: handleLoadOlder,
    hasOlder,
    loadingOlder,
  });

  const call = useCentralCall();

  const fetchConversation = useCallback(async (silent = false) => {
    if (!uid) return;
    if (!silent) setLoading(true);
    try {
      // Both endpoints resolve the same customer conversation server-side:
      // fetch them in parallel instead of waiting for the id first.
      const [cRes, mRes] = await Promise.all([
        fetch(`/api/user/chat/conversation?uid=${encodeURIComponent(uid)}`),
        fetch(`/api/user/chat/messages?uid=${encodeURIComponent(uid)}&limit=${CHAT_PAGE_SIZE}`),
      ]);
      const [cData, mData] = await Promise.all([cRes.json(), mRes.json()]);
      if (cData.success) {
        setConversation(cData.conversation);
        conversationIdRef.current = cData.conversation.conversationId;
      }
      if (mData.success) {
        const fresh = applyPage(mData);
        setMessages((prev) => {
          const pending = prev.filter((m) => m.status && m.messageId?.startsWith("tmp_"));
          return [...fresh, ...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });
      }
      if (!silent && conversationIdRef.current) {
        fetch("/api/user/chat/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, conversationId: conversationIdRef.current }),
        }).catch(() => {});
      }
    } catch {}
    finally { if (!silent) setLoading(false); }
  }, [uid, applyPage]);

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => { fetchConversation(); }, 0);
    return () => clearTimeout(t);
  }, [uid, fetchConversation]);

  useEffect(() => {
    setActiveConversation(conversation?.conversationId || null, "customer");
    return () => setActiveConversation(null, null);
  }, [conversation?.conversationId]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { replyToRef.current = replyTo; }, [replyTo]);
  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  // Mobile help drawer: keyboard close and background scroll lock.
  useEffect(() => {
    if (!helpOpen) return;
    const onKeyDown = (event) => { if (event.key === "Escape") setHelpOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [helpOpen]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "chat:presence" && data?.uid === conversation?.assignedStaffId) {
        setConversation((current) => current
          ? { ...current, assignedStaffOnline: Boolean(data.online) }
          : current);
      }
      if (type === "chat:reaction" && data?.messageId) {
        setMessages((prev) => prev.map((message) => message.messageId === data.messageId
          ? { ...message, reactions: data.reactions || [] }
          : message));
      }
      if (type === "chat:message" && data?.message) {
        setMessages((prev) => upsertMessage(prev, { ...data.message, status: "sent" }));
        if (data.conversation) {
          setConversation((current) => ({
            ...current,
            ...data.conversation,
            assignedStaffOnline: data.conversation.assignedStaffOnline ?? current?.assignedStaffOnline ?? false,
          }));
        }
      }
    },
    // SSE reconnect: re-sync anything missed while offline.
    onReconnect: () => fetchConversation(true),
  });

  const handleSend = useCallback(async (payload) => {
    if (!uid || !conversationIdRef.current) throw new Error("Chat is not ready");
    const clientId = payload.clientId || `c_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const temp = {
      messageId: `tmp_${clientId}`,
      clientId,
      conversationId: conversationIdRef.current,
      senderId: uid,
      senderNameSnapshot: user?.displayName || user?.email || "You",
      messageType: payload.messageType || "text",
      content: payload.content || "",
      attachments: payload.attachments || [],
      voiceMetadata: payload.voiceMetadata || null,
      replyTo: payload.replyToMessageId
        ? messagesRef.current.find((message) => message.messageId === payload.replyToMessageId) || replyToRef.current
        : null,
      readBy: [uid],
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    pendingPayloadRef.current.set(clientId, payload);
    pinToBottom();
    setMessages((prev) => [...prev, temp]);
    try {
      const res = await fetch("/api/user/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, conversationId: conversationIdRef.current, ...payload, clientId }),
      });
      const data = await res.json();
      if (!data.success || !data.message) throw new Error(data.message || "Could not send message");
      pendingPayloadRef.current.delete(clientId);
      setMessages((prev) => prev.map((m) => m.clientId === clientId ? { ...data.message, status: "sent" } : m));
      return data.message;
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.clientId === clientId ? { ...m, status: "failed" } : m));
      throw err;
    }
  }, [uid, user, pinToBottom]);

  const reactToMessage = useCallback(async (message, emoji) => {
    if (!uid || !conversationIdRef.current || !message?.messageId) return;
    const current = messagesRef.current.find((m) => m.messageId === message.messageId)?.reactions || [];
    const mine = current.find((r) => r.uid === uid && r.emoji === emoji);
    const optimistic = mine
      ? current.filter((r) => r !== mine)
      : [...current, { uid, emoji, at: new Date().toISOString() }];
    setMessages((prev) => prev.map((m) => m.messageId === message.messageId ? { ...m, reactions: optimistic } : m));
    try {
      const res = await fetch("/api/user/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, conversationId: conversationIdRef.current, messageId: message.messageId, emoji }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Could not save reaction");
      setMessages((prev) => prev.map((m) => m.messageId === message.messageId ? { ...m, reactions: data.reactions || [] } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.messageId === message.messageId ? { ...m, reactions: current } : m));
    }
  }, [uid]);

  const retryMessage = useCallback((message) => {
    const payload = pendingPayloadRef.current.get(message.clientId);
    if (!payload) return;
    setMessages((prev) => prev.map((m) => m.clientId === message.clientId ? { ...m, status: "sending" } : m));
    handleSend({ ...payload, clientId: message.clientId }).catch(() => {});
  }, [handleSend]);

  const jumpToMessage = useCallback(async (messageId) => {
    const findTarget = () => Array.from(listRef.current?.querySelectorAll("[data-message-id]") || [])
      .find((element) => element.dataset.messageId === messageId);
    let target = findTarget();
    while (!target) {
      const older = await loadOlder();
      if (!older?.length) break;
      setMessages((prev) => mergeOlderMessages(prev, older));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      target = findTarget();
    }
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 1400);
  }, [loadOlder]);

  const sharedConversationId = conversation?.conversationId;
  const fetchSharedPage = useCallback(async ({ kind, before, limit }) => {
    const params = new URLSearchParams({ uid, kind, limit: String(limit) });
    if (sharedConversationId) params.set("conversationId", sharedConversationId);
    if (before) params.set("before", before);
    const response = await fetch(`/api/user/chat/shared?${params}`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Could not load shared items.");
    return data;
  }, [uid, sharedConversationId]);

  const getAttachmentUrl = useCallback((attachment) =>
    `/api/user/chat/attachments?attachmentId=${encodeURIComponent(attachment?.id || "")}&uid=${encodeURIComponent(uid || "")}`,
  [uid]);

  const startCall = (callType = "voice") => {
    if (!conversation?.conversationId) return;
    // Customers may call even before a staff member is assigned: the server
    // resolves the target and broadcasts the offer to online staff when needed.
    call?.startCall({
      conversationId: conversation.conversationId,
      targetUid: conversation.assignedStaffId || null,
      targetName: "Ad Buzz Support",
      callType,
      system: "customer",
    });
  };

  return (
    <div className={`chat-interface grid grid-cols-1 ${compact ? "chat-interface--compact" : "gap-4 lg:grid-cols-[1fr_320px]"}`}>
      <div className={`flex flex-col overflow-hidden border border-slate-200 bg-white ${compact ? "h-full rounded-xl" : "rounded-2xl shadow-sm"}`} style={compact ? undefined : { height: "calc(100vh - 140px)" }}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3">
            {conversation?.assignedStaffId ? (
              <ChatParticipantAvatar
                person={{ displayName: conversation.assignedStaffName || "Support", avatar: conversation.assignedStaffAvatar }}
                size="h-9 w-9"
                online={conversation.assignedStaffOnline}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logo.jpeg" alt="Ad Buzz" className="h-9 w-9 rounded-full object-cover" />
            )}
            <div>
              <p className="text-sm font-bold text-slate-900">{conversation?.assignedStaffName || "Ad Buzz"}</p>
              <p className={`text-xs ${conversation?.assignedStaffOnline ? "text-green-600" : "text-slate-500"}`}>
                {conversation?.assignedStaffId ? (conversation.assignedStaffOnline ? "Online" : "Offline") : "Support team"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => startCall("voice")} disabled={!conversation} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Voice call"><Phone size={18} /></button>
            <button type="button" onClick={() => startCall("video")} disabled={!conversation} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Video call"><Video size={18} /></button>
            <button type="button" onClick={() => setInfoOpen((open) => !open)} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label="Shared conversation information" aria-expanded={infoOpen}><Info size={18} /></button>
            {showHelpMenu && (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-full p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 sm:hidden"
                aria-label="Open chat help menu"
                aria-expanded={helpOpen}
              >
                <MoreVertical size={18} />
              </button>
            )}
            <button className={`rounded-full p-2 text-slate-600 hover:bg-slate-100 ${showHelpMenu ? "hidden sm:inline-flex" : ""}`} aria-label="More"><MoreVertical size={18} /></button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 text-center">
          <span className="text-xs font-medium text-slate-500">Live Chat Conversation</span>
        </div>

        <div className="px-4 py-2">
          <div className="chat-msg-row chat-msg-row--in mb-0">
            <div className="chat-msg-avatar">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="" className="h-8 w-8 rounded-full object-cover" />
            </div>
            <div className="chat-msg-content">
              <div className="chat-msg-bubble">
                <p className="chat-msg-text">Welcome to Ad Buzz Support. How can we help you today?</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-2">
            {loading && <p className="text-center text-xs text-slate-400">Loading...</p>}
            <ChatHistoryStatus loadingOlder={loadingOlder} showBeginning={!hasOlder && !loading && messages.length > 0} />
            {messages.map((m, index) => {
              const previous = messages[index - 1];
              const changedDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const isIncoming = m.senderId !== uid;
              const isEvent = m.messageType === "system_event" || m.messageType === "call_event";
              const senderName = m.senderNameSnapshot
                || (m.senderId === conversation?.assignedStaffId ? conversation?.assignedStaffName : "")
                || "";
              const showSender = showSenderIdentity && !compact && isIncoming && !isEvent && Boolean(senderName);
              return (
                <React.Fragment key={m.clientId || m.messageId}>
                  {changedDay && <ChatDateSeparator value={m.createdAt} />}
                  {showSender && (
                    <div className="mb-1 flex items-center gap-2.5" aria-label={`Message from ${senderName}`}>
                      {/* Aligns the label with the bubble content, not the avatar. */}
                      <span className="w-8 shrink-0" aria-hidden="true" />
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[11px] font-semibold leading-4 text-slate-800">{senderName}</span>
                        <span className="shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-orange-700">
                          {senderRoleLabel(m.senderRole)}
                        </span>
                      </span>
                    </div>
                  )}
                  <ChatMessageBubble
                    message={m}
                    isOwn={m.senderId === uid}
                    showSender={m.senderId !== uid}
                    senderOnline={Boolean(conversation?.assignedStaffOnline && m.senderId === conversation.assignedStaffId)}
                    onRetry={retryMessage}
                    onReply={setReplyTo}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedMessageId === m.messageId}
                    uid={uid}
                    onReact={reactToMessage}
                  />
                </React.Fragment>
              );
            })}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
          <ScrollToLatestButton visible={showScrollToLatest} onClick={() => scrollToLatest()} />
          {infoOpen && <ChatInfoPanel
            conversationKey={conversation?.conversationId}
            fetchPage={fetchSharedPage}
            getAttachmentUrl={getAttachmentUrl}
            onClose={() => setInfoOpen(false)}
          />}
        </div>

        <ChatComposer uid={uid} onSend={handleSend} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
      </div>

      {!compact && <div className="space-y-4"><HelpSections /></div>}

      {showHelpMenu && !compact && helpOpen && (
        <div
          className="fixed inset-0 z-[105] flex justify-end bg-slate-950/50 sm:hidden"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Chat information and help"
            className="flex h-full w-[min(22rem,88vw)] flex-col bg-[#F8F5F1] shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Chat info &amp; help</h2>
                <p className="text-xs text-slate-500">Ad Buzz Support</p>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                aria-label="Close help panel"
                autoFocus
              >
                <X size={20} />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <HelpSections />
            </div>
          </aside>
        </div>
      )}

    </div>
  );
}
