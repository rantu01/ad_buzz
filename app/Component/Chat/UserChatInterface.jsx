"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Video, Info, MoreVertical } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import ChatMessageBubble from "@/app/Component/Chat/ChatMessageBubble";
import ChatComposer from "@/app/Component/Chat/ChatComposer";
import { useCentralCall } from "@/app/Component/Chat/CentralCallProvider";
import useSSE from "@/app/Component/Hooks/useSSE";
import useChatScroll from "@/app/Component/Hooks/useChatScroll";
import useChatPagination from "@/app/Component/Hooks/useChatPagination";
import ScrollToLatestButton from "@/app/Component/Chat/ScrollToLatestButton";
import ChatHistoryStatus from "@/app/Component/Chat/ChatHistoryStatus";
import { CHAT_PAGE_SIZE, mergeOlderMessages, upsertMessage } from "@/lib/chatPagination";
import { setActiveConversation } from "@/lib/activeChat";

export default function UserChatInterface({ compact = false }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
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

  const { showScrollToLatest, handleScroll, scrollToLatest, pinToBottom } = useChatScroll({
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

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "chat:message" && data?.message) {
        setMessages((prev) => upsertMessage(prev, { ...data.message, status: "sent" }));
        if (data.conversation) setConversation(data.conversation);
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

  const retryMessage = useCallback((message) => {
    const payload = pendingPayloadRef.current.get(message.clientId);
    if (!payload) return;
    setMessages((prev) => prev.map((m) => m.clientId === message.clientId ? { ...m, status: "sending" } : m));
    handleSend({ ...payload, clientId: message.clientId }).catch(() => {});
  }, [handleSend]);

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Ad Buzz" className="h-9 w-9 rounded-full object-cover" />
            <div>
              <p className="text-sm font-bold text-slate-900">Ad Buzz</p>
              <p className="text-xs text-green-600">Online now</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => startCall("voice")} disabled={!conversation} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Voice call"><Phone size={18} /></button>
            <button type="button" onClick={() => startCall("video")} disabled={!conversation} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Video call"><Video size={18} /></button>
            <button className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Info"><Info size={18} /></button>
            <button className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="More"><MoreVertical size={18} /></button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 text-center">
          <span className="text-xs font-medium text-slate-500">Live Chat Conversation</span>
        </div>

        <div className="px-4 py-3">
          <div className="flex gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="" className="h-8 w-8 rounded-full" />
            <div>
              <p className="text-xs font-semibold text-slate-600">Ad Buzz Support</p>
              <div className="mt-1 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
                Welcome to Ad Buzz Support. How can we help you today?
              </div>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-2">
            {loading && <p className="text-center text-xs text-slate-400">Loading...</p>}
            <ChatHistoryStatus loadingOlder={loadingOlder} showBeginning={!hasOlder && !loading && messages.length > 0} />
            {messages.map((m) => (
              <ChatMessageBubble key={m.clientId || m.messageId} message={m} isOwn={m.senderId === uid} showSender={m.senderId !== uid} onRetry={retryMessage} />
            ))}
          </div>
          <ScrollToLatestButton visible={showScrollToLatest} onClick={() => scrollToLatest()} />
        </div>

        <ChatComposer uid={uid} onSend={handleSend} />
      </div>

      {!compact && <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Your team</h3>
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="" className="h-10 w-10 rounded-full" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Ad Buzz</p>
              <p className="flex items-center gap-1 text-xs text-green-600"><span className="h-2 w-2 rounded-full bg-green-500" /> Online now</p>
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
      </div>}

    </div>
  );
}
