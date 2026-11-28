"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Video, Search, User as UserIcon, Info, Menu, ArrowLeft, X, MessageCircle } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
import ChatMessageBubble from "@/app/Component/Chat/ChatMessageBubble";
import ChatComposer from "@/app/Component/Chat/ChatComposer";
import { useCentralCall } from "@/app/Component/Chat/CentralCallProvider";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";
import useSSE from "@/app/Component/Hooks/useSSE";
import useChatScroll from "@/app/Component/Hooks/useChatScroll";
import useChatPagination from "@/app/Component/Hooks/useChatPagination";
import ScrollToLatestButton from "@/app/Component/Chat/ScrollToLatestButton";
import ChatHistoryStatus from "@/app/Component/Chat/ChatHistoryStatus";
import ChatInfoPanel from "@/app/Component/Chat/ChatInfoPanel";
import ChatDateSeparator from "@/app/Component/Chat/ChatDateSeparator";
import { CHAT_PAGE_SIZE, mergeOlderMessages, upsertMessage } from "@/lib/chatPagination";
import { setActiveConversation } from "@/lib/activeChat";

// Shared by the desktop right panel and the mobile information drawer.
function CustomerInfoPanel({ selectedConv, staffList, assignTo, setStatus }) {
  if (!selectedConv) return null;
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Customer info</h3>
        <div className="mt-3 space-y-1 text-xs text-slate-600">
          <p><span className="font-semibold">Name:</span> {selectedConv.customerName}</p>
          <p><span className="font-semibold">Email:</span> {selectedConv.customerEmail}</p>
          <p><span className="font-semibold">Status:</span> {selectedConv.status}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Assignment</h3>
        <select value={selectedConv.assignedStaffId || ""} onChange={(event) => assignTo(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
          <option value="">Unassigned</option>
          {staffList.map((staff) => (
            <option key={staff.uid} value={staff.uid}>{staff.displayName} · {String(staff.role).replace(/_/g, " ")}</option>
          ))}
        </select>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setStatus("open")} className="min-h-10 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">Reopen</button>
          <button type="button" onClick={() => setStatus("closed")} className="min-h-10 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">Close</button>
        </div>
      </div>
    </>
  );
}

export default function AdminChatPage() {
  const { user } = useAuth();
  const { profile } = useAdmin();
  const uid = user?.uid;
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [staffList, setStaffList] = useState([]);
  const [onlineMap, setOnlineMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const listRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const messagesRef = useRef(messages);
  const replyToRef = useRef(replyTo);
  const convIdRef = useRef(null);
  const selectedConvRef = useRef(null);
  const pendingPayloadRef = useRef(new Map());
  const messageCacheRef = useRef(new Map());
  const refreshTimerRef = useRef(null);
  const openSeqRef = useRef(0);

  const fetchPage = useCallback(async ({ before, limit }) => {
    const cid = convIdRef.current;
    if (!uid || !cid) return { messages: [], hasMore: false, nextCursor: null };
    const url = `/api/admin/chat/messages?uid=${encodeURIComponent(uid)}&conversationId=${encodeURIComponent(cid)}&limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
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
    restorePage,
    getState,
  } = useChatPagination({ key: selectedId, fetchPage, enabled: Boolean(uid) });

  const handleLoadOlder = useCallback(async () => {
    const older = await loadOlder();
    if (!older?.length) return;
    setMessages((prev) => {
      const merged = mergeOlderMessages(prev, older);
      const cid = convIdRef.current;
      if (cid) messageCacheRef.current.set(cid, { ...getState(), messages: merged, at: Date.now() });
      return merged;
    });
  }, [loadOlder, getState]);

  const { showScrollToLatest, handleScroll, scrollToLatest, pinToBottom, bottomRef, listRefCallback } = useChatScroll({
    listRef,
    messages,
    conversationKey: selectedId,
    loading,
    onLoadOlder: handleLoadOlder,
    hasOlder,
    loadingOlder,
  });

  const call = useCentralCall();

  const fetchConversations = useCallback(async () => {
    if (!uid) return;
    try {
      const url = `/api/admin/chat/conversations?uid=${encodeURIComponent(uid)}&status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(searchRef.current)}&limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setConversations(data.items || []);
    } catch {}
  }, [uid, statusFilter]);

  const fetchStaff = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/admin/chat/staff?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) setStaffList(data.staff || []);
    } catch {}
  }, [uid]);

  const scheduleListRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      fetchConversations();
    }, 120);
  }, [fetchConversations]);

  const openConversation = useCallback(async (conv) => {
    if (!uid || !conv?.conversationId) return;
    const cid = conv.conversationId;
    const seq = ++openSeqRef.current;
    setSelectedId(cid);
    setSelectedConv(conv);
    setReplyTo(null);
    setInfoOpen(false);
    selectedConvRef.current = conv;
    convIdRef.current = cid;
    const cached = messageCacheRef.current.get(cid);
    setMessages(cached ? cached.messages : []);
    restorePage(cached ? { cursor: cached.cursor, hasMore: cached.hasOlder } : {});
    setLoading(!cached);
    try {
      const res = await fetch(`/api/admin/chat/messages?uid=${encodeURIComponent(uid)}&conversationId=${encodeURIComponent(cid)}&limit=${CHAT_PAGE_SIZE}`);
      const data = await res.json();
      if (seq !== openSeqRef.current) return; // a newer conversation was opened
      const list = data.success ? applyPage(data) : [];
      const state = data.success ? getState() : { cursor: null, hasOlder: false };
      messageCacheRef.current.set(cid, { ...state, messages: list, at: Date.now() });
      setMessages(list);
      fetch(`/api/admin/chat/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, conversationId: cid }) }).catch(() => {});
    } catch {}
    finally { if (seq === openSeqRef.current) setLoading(false); }
    scheduleListRefresh();
  }, [uid, scheduleListRefresh, applyPage, restorePage, getState]);

  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { replyToRef.current = replyTo; }, [replyTo]);

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => { fetchConversations(); fetchStaff(); }, 0);
    return () => clearTimeout(t);
  }, [uid, statusFilter, fetchConversations, fetchStaff]);

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(fetchConversations, 300);
    return () => clearTimeout(t);
  }, [search, fetchConversations, uid]);

  useEffect(() => {
    setActiveConversation(selectedConv?.pending ? null : selectedConv?.conversationId || null, "customer");
    return () => setActiveConversation(null, null);
  }, [selectedConv?.conversationId, selectedConv?.pending]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "internal:presence" && data?.uid) {
        setOnlineMap((prev) => ({ ...prev, [data.uid]: Boolean(data.online) }));
      }
      if (type === "chat:message" && data?.message) {
        const cid = data.conversationId || data.message.conversationId;
        if (cid === convIdRef.current) {
          setMessages((prev) => upsertMessage(prev, { ...data.message, status: "sent" }));
        }
        scheduleListRefresh();
        if (data?.conversation) {
          setSelectedConv((prev) => prev?.conversationId === data.conversation.conversationId
            ? {
                ...data.conversation,
                customerAvatar: prev.customerAvatar,
                customerOnline: onlineMap[data.conversation.customerId] ?? prev.customerOnline,
              }
            : prev);
        }
      }
      if (type === "chat:reaction" && data?.messageId) {
        setMessages((prev) => prev.map((message) => message.messageId === data.messageId
          ? { ...message, reactions: data.reactions || [] }
          : message));
      }
      if (type === "chat:read") scheduleListRefresh();
    },
    onReconnect: () => {
      setOnlineMap({});
      fetchConversations();
      if (convIdRef.current) openConversation(selectedConvRef.current || { conversationId: convIdRef.current });
    },
  });

  const handleSend = useCallback(async (payload) => {
    if (!uid || !selectedConvRef.current) throw new Error("No conversation selected");
    const clientId = payload.clientId || `c_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const temp = {
      messageId: `tmp_${clientId}`,
      clientId,
      conversationId: selectedConvRef.current.conversationId,
      senderId: uid,
      senderNameSnapshot: user?.displayName || user?.email || "Staff",
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
      const res = await fetch("/api/admin/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, conversationId: selectedConvRef.current.conversationId, ...payload, clientId }),
      });
      const data = await res.json();
      if (!data.success || !data.message) throw new Error(data.message || "Could not send message");
      pendingPayloadRef.current.delete(clientId);
      setMessages((prev) => prev.map((m) => m.clientId === clientId ? { ...data.message, status: "sent" } : m));
      scheduleListRefresh();
      return data.message;
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.clientId === clientId ? { ...m, status: "failed" } : m));
      throw err;
    }
  }, [uid, user, scheduleListRefresh, pinToBottom]);

  const reactToMessage = useCallback(async (message, emoji) => {
    if (!uid || !convIdRef.current || !message?.messageId) return;
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
        body: JSON.stringify({ uid, conversationId: convIdRef.current, messageId: message.messageId, emoji }),
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

  const fetchSharedPage = useCallback(async ({ kind, before, limit }) => {
    const params = new URLSearchParams({ uid, conversationId: selectedId, kind, limit: String(limit) });
    if (before) params.set("before", before);
    const response = await fetch(`/api/admin/chat/shared?${params}`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Could not load shared items.");
    return data;
  }, [uid, selectedId]);

  const getAttachmentUrl = useCallback((attachment) =>
    `/api/user/chat/attachments?attachmentId=${encodeURIComponent(attachment?.id || "")}&uid=${encodeURIComponent(uid || "")}`,
  [uid]);

  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  useEffect(() => {
    if (!detailsOpen && !listOpen) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setDetailsOpen(false);
      setListOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [detailsOpen, listOpen]);

  const assignTo = async (staffUid) => {
    if (!uid || !selectedConv) return;
    const staff = staffList.find((s) => s.uid === staffUid);
    await fetch(`/api/admin/chat/conversations/${selectedConv.conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, action: "assign", assignedStaffId: staffUid, assignedStaffName: staff?.displayName || null }),
    });
    setSelectedConv((prev) => prev ? { ...prev, assignedStaffId: staffUid, assignedStaffName: staff?.displayName } : prev);
    fetchConversations();
  };

  const setStatus = async (status) => {
    if (!uid || !selectedConv) return;
    await fetch(`/api/admin/chat/conversations/${selectedConv.conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, action: "status", status }),
    });
    setSelectedConv((prev) => prev ? { ...prev, status } : prev);
    fetchConversations();
  };

  const startCall = (callType = "voice") => {
    if (!selectedConv) return;
    call?.startCall({
      conversationId: selectedConv.conversationId,
      targetUid: selectedConv.customerId,
      targetName: selectedConv.customerName || selectedConv.customerEmail || "Customer",
      targetAvatar: selectedConv.customerAvatar || "",
      callType,
      system: "customer",
    });
  };
  const selectedCustomerOnline = selectedConv
    ? onlineMap[selectedConv.customerId] ?? selectedConv.customerOnline
    : false;

  return (
    <div className="admin-chat-layout">
      {/* Conversation list */}
      <div className={`admin-chat-side flex-col overflow-hidden border border-slate-200 bg-white shadow-sm ${listOpen ? "admin-chat-side--open flex" : ""}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-3 md:hidden">
          <h2 className="text-sm font-bold text-slate-900">Conversations</h2>
          <button type="button" onClick={() => setListOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close conversation list"><X size={18} /></button>
        </div>
        <div className="shrink-0 border-b border-slate-200 p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm focus:outline-none" />
          </div>
          <div className="mt-2 flex gap-1">
            {["all", "unread", "open", "closed"].map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusFilter === f ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600"}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="admin-chat-scroll min-h-0 flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button key={c.conversationId} onClick={() => { openConversation(c); setListOpen(false); }} className={`w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === c.conversationId ? "bg-orange-50" : ""}`}>
              <div className="flex items-center gap-2">
                <ChatParticipantAvatar
                  person={{ displayName: c.customerName || c.customerEmail, avatar: c.customerAvatar }}
                  size="h-9 w-9"
                  online={onlineMap[c.customerId] ?? c.customerOnline}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.customerName || c.customerEmail || "Customer"}</p>
                    <span className="text-[10px] text-slate-400">{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{c.lastMessage || "No messages"}</p>
                </div>
                {c.unreadForStaff > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{c.unreadForStaff}</span>
                )}
              </div>
            </button>
          ))}
          {conversations.length === 0 && <p className="p-4 text-center text-xs text-slate-400">No conversations</p>}
        </div>
      </div>

      {/* Main conversation */}
      <div className="admin-chat-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {selectedConv ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4 sm:py-3">
              <button type="button" onClick={() => setListOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations"><ArrowLeft size={18} /></button>
              <ChatParticipantAvatar
                person={{ displayName: selectedConv.customerName || selectedConv.customerEmail, avatar: selectedConv.customerAvatar }}
                size="h-9 w-9 shrink-0"
                online={selectedCustomerOnline}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{selectedConv.customerName || selectedConv.customerEmail}</p>
                <p className="truncate text-xs text-slate-500">{selectedConv.status} · {selectedConv.assignedStaffName || "Unassigned"} · {selectedCustomerOnline ? "Online" : "Offline"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <button type="button" onClick={() => startCall("voice")} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" aria-label="Voice call"><Phone size={18} /></button>
                <button type="button" onClick={() => startCall("video")} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" aria-label="Video call"><Video size={18} /></button>
                <button type="button" onClick={() => setInfoOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label="Shared conversation information" aria-expanded={infoOpen}><Info size={18} /></button>
                <button type="button" onClick={() => setDetailsOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 xl:hidden" aria-label="Customer information"><UserIcon size={18} /></button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div ref={listRefCallback} onScroll={handleScroll} className="admin-chat-scroll h-full overflow-y-auto bg-slate-50 p-3">
                {loading && <p className="text-center text-xs text-slate-400">Loading...</p>}
                <ChatHistoryStatus loadingOlder={loadingOlder} showBeginning={!hasOlder && !loading && messages.length > 0} />
                {messages.map((m, index) => {
                  const previous = messages[index - 1];
                  const changedDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                  return (
                    <React.Fragment key={m.clientId || m.messageId}>
                      {changedDay && <ChatDateSeparator value={m.createdAt} />}
                      <ChatMessageBubble
                        message={m}
                        isOwn={m.senderId === uid}
                        showSender={m.senderId !== uid}
                        senderOnline={Boolean(onlineMap[m.senderId] ?? (m.senderId === selectedConv.customerId && selectedCustomerOnline))}
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
                conversationKey={selectedId}
                fetchPage={fetchSharedPage}
                getAttachmentUrl={getAttachmentUrl}
                onClose={() => setInfoOpen(false)}
              />}
            </div>
            <div className="min-w-0 shrink-0">
              <ChatComposer uid={uid} uploadUrl="/api/user/chat/attachments" onSend={handleSend} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-slate-400">
            <MessageCircle size={32} aria-hidden="true" />
            <p className="text-sm">Select a conversation to start chatting</p>
            <button type="button" onClick={() => setListOpen(true)} className="flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white md:hidden">
              <Menu size={16} /> Open conversations
            </button>
          </div>
        )}
      </div>

      {/* Desktop right info panel; on smaller screens it opens as a drawer. */}
      <div className="admin-chat-info admin-chat-scroll space-y-4 overflow-y-auto">
        <CustomerInfoPanel selectedConv={selectedConv} staffList={staffList} assignTo={assignTo} setStatus={setStatus} />
      </div>

      {detailsOpen && (
        <div
          className="fixed inset-0 z-[100] flex justify-end bg-slate-950/50 xl:hidden"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsOpen(false); }}
        >
          <aside role="dialog" aria-modal="true" aria-label="Customer information" className="flex h-full w-[min(22rem,88vw)] flex-col bg-[#F8F5F1] shadow-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Chat information</h2>
              <button type="button" onClick={() => setDetailsOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close customer information"><X size={18} /></button>
            </header>
            <div className="admin-chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <CustomerInfoPanel selectedConv={selectedConv} staffList={staffList} assignTo={assignTo} setStatus={setStatus} />
            </div>
          </aside>
        </div>
      )}

    </div>
  );
}
