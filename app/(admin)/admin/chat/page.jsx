"use client";

import React, { useEffect, useRef, useState } from "react";
import { Phone, Search, User as UserIcon } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
import ChatMessageBubble from "@/app/Component/Chat/ChatMessageBubble";
import ChatComposer from "@/app/Component/Chat/ChatComposer";
import { useCentralCall } from "@/app/Component/Chat/CentralCallProvider";
import useSSE from "@/app/Component/Hooks/useSSE";

export default function AdminChatPage() {
  const { user } = useAuth();
  const { profile } = useAdmin();
  const uid = user?.uid;
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const convIdRef = useRef(null);

  const call = useCentralCall();

  const fetchConversations = async () => {
    if (!uid) return;
    try {
      const url = `/api/admin/chat/conversations?uid=${encodeURIComponent(uid)}&status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}&limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setConversations(data.items || []);
    } catch {}
  };

  const fetchStaff = async () => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/admin/chat/staff?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) setStaffList(data.staff || []);
    } catch {}
  };

  const openConversation = async (conv) => {
    if (!uid) return;
    setSelectedId(conv.conversationId);
    setSelectedConv(conv);
    convIdRef.current = conv.conversationId;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/chat/messages?uid=${encodeURIComponent(uid)}&conversationId=${encodeURIComponent(conv.conversationId)}&limit=50`);
      const data = await res.json();
      if (data.success) setMessages(data.messages || []);
      fetch(`/api/admin/chat/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, conversationId: conv.conversationId }) }).catch(() => {});
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => { fetchConversations(); fetchStaff(); }, 0);
    return () => clearTimeout(t);
  }, [uid, statusFilter]);

  useEffect(() => {
    if (!uid) return;
    const handle = () => fetchConversations();
    const t = setTimeout(handle, 300);
    return () => clearTimeout(t);
  }, [search]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "chat:message") {
        if (data?.message) {
          if (data.conversationId === selectedId || data?.message?.conversationId === selectedId) {
            setMessages((prev) => prev.some((m) => m.messageId === data.message.messageId) ? prev : [...prev, data.message]);
            setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
          }
          fetchConversations();
        }
        if (data?.conversation) {
          setSelectedConv((prev) => prev?.conversationId === data.conversation.conversationId ? data.conversation : prev);
        }
      }
      if (type === "chat:read") fetchConversations();
    },
  });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = async (payload) => {
    if (!uid || !selectedConv) return;
    const res = await fetch("/api/admin/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, conversationId: selectedConv.conversationId, ...payload }),
    });
    const data = await res.json();
    if (data.success && data.message) {
      setMessages((prev) => prev.some((m) => m.messageId === data.message.messageId) ? prev : [...prev, data.message]);
    }
  };

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

  const startCall = () => {
    if (!selectedConv) return;
    call?.startCall({
      conversationId: selectedConv.conversationId,
      targetUid: selectedConv.customerId,
      targetName: selectedConv.customerName || selectedConv.customerEmail || "Customer",
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
                <button type="button" onClick={startCall} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Voice call"><Phone size={18} /></button>
              </div>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto bg-slate-50 p-3">
              {loading && <p className="text-center text-xs text-slate-400">Loading...</p>}
              {messages.map((m) => (
                <ChatMessageBubble key={m.messageId} message={m} isOwn={m.senderId === uid} showSender={m.senderId !== uid} />
              ))}
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
