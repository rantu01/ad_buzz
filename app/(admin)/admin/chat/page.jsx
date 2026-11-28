"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Video, Search, User as UserIcon } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
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
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
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

  const { showScrollToLatest, handleScroll, scrollToLatest, pinToBottom } = useChatScroll({
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

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => { fetchConversations(); fetchStaff(); }, 0);
    return () => clearTimeout(t);
  }, [uid, statusFilter, fetchConversations, fetchStaff]);

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(fetchConversations, 300);
    return () => clearTimeout(t);
  }, [search, fetchConversations]);

  useEffect(() => {
    setActiveConversation(selectedConv?.pending ? null : selectedConv?.conversationId || null, "customer");
    return () => setActiveConversation(null, null);
  }, [selectedConv?.conversationId]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "chat:message" && data?.message) {
        const cid = data.conversationId || data.message.conversationId;
        if (cid === convIdRef.current) {
          setMessages((prev) => upsertMessage(prev, { ...data.message, status: "sent" }));
        }
        scheduleListRefresh();
        if (data?.conversation) {
          setSelectedConv((prev) => prev?.conversationId === data.conversation.conversationId ? data.conversation : prev);
        }
      }
      if (type === "chat:read") scheduleListRefresh();
    },
    onReconnect: () => {
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

  const retryMessage = useCallback((message) => {
    const payload = pendingPayloadRef.current.get(message.clientId);
    if (!payload) return;
    setMessages((prev) => prev.map((m) => m.clientId === message.clientId ? { ...m, status: "sending" } : m));
    handleSend({ ...payload, clientId: message.clientId }).catch(() => {});
  }, [handleSend]);

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
      callType,
      system: "customer",
    });
  };

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 120px)" }}>
      {/* Conversation list */}
      <div className="w-80 flex-shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200">
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
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button key={c.conversationId} onClick={() => openConversation(c)} className={`w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === c.conversationId ? "bg-orange-50" : ""}`}>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                  {(c.customerName || "?").charAt(0).toUpperCase()}
                </div>
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
      <div className="flex-1 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {selectedConv ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                  {(selectedConv.customerName || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedConv.customerName || selectedConv.customerEmail}</p>
                  <p className="text-xs text-slate-500">{selectedConv.status} · {selectedConv.assignedStaffName || "Unassigned"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => startCall("voice")} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Voice call"><Phone size={18} /></button>
                <button type="button" onClick={() => startCall("video")} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Video call"><Video size={18} /></button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto bg-slate-50 p-3">
                {loading && <p className="text-center text-xs text-slate-400">Loading...</p>}
                <ChatHistoryStatus loadingOlder={loadingOlder} showBeginning={!hasOlder && !loading && messages.length > 0} />
                {messages.map((m) => (
                  <ChatMessageBubble key={m.clientId || m.messageId} message={m} isOwn={m.senderId === uid} showSender={m.senderId !== uid} onRetry={retryMessage} />
                ))}
              </div>
              <ScrollToLatestButton visible={showScrollToLatest} onClick={() => scrollToLatest()} />
            </div>
            <ChatComposer uid={uid} uploadUrl="/api/user/chat/attachments" onSend={handleSend} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400">Select a conversation</div>
        )}
      </div>

      {/* Right info panel */}
      <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
        {selectedConv && (
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
              <select value={selectedConv.assignedStaffId || ""} onChange={(e) => assignTo(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
                <option value="">Unassigned</option>
                {staffList.map((s) => (
                  <option key={s.uid} value={s.uid}>{s.displayName} · {String(s.role).replace(/_/g, " ")}</option>
                ))}
              </select>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setStatus("open")} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">Reopen</button>
                <button onClick={() => setStatus("closed")} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">Close</button>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
