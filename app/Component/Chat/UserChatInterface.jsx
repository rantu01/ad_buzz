"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Info, MoreVertical } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import ChatMessageBubble from "@/app/Component/Chat/ChatMessageBubble";
import ChatComposer from "@/app/Component/Chat/ChatComposer";
import { useCentralCall } from "@/app/Component/Chat/CentralCallProvider";
import useSSE from "@/app/Component/Hooks/useSSE";

export default function UserChatInterface({ compact = false }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  const call = useCentralCall();

  const fetchConversation = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const cRes = await fetch(`/api/user/chat/conversation?uid=${encodeURIComponent(uid)}`);
      const cData = await cRes.json();
      if (cData.success) {
        setConversation(cData.conversation);
        const mRes = await fetch(`/api/user/chat/messages?uid=${encodeURIComponent(uid)}&conversationId=${encodeURIComponent(cData.conversation.conversationId)}&limit=50`);
        const mData = await mRes.json();
        if (mData.success) setMessages(mData.messages || []);
        fetch("/api/user/chat/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, conversationId: cData.conversation.conversationId }) }).catch(() => {});
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => { fetchConversation(); }, 0);
    return () => clearTimeout(t);
  }, [uid]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "chat:message") {
        if (data?.message) {
          setMessages((prev) => prev.some((m) => m.messageId === data.message.messageId) ? prev : [...prev, data.message]);
          if (data.conversation) setConversation(data.conversation);
          setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
        }
      }
    },
  });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = async (payload) => {
    if (!uid || !conversation) return;
    const res = await fetch("/api/user/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, conversationId: conversation.conversationId, ...payload }),
    });
    const data = await res.json();
    if (data.success && data.message) {
      setMessages((prev) => prev.some((m) => m.messageId === data.message.messageId) ? prev : [...prev, data.message]);
    }
  };

  const startCall = () => {
    const target = conversation?.assignedStaffId || null;
    if (!target) return;
    call?.startCall({
      conversationId: conversation.conversationId,
      targetUid: target,
      targetName: "AdsFixer Support",
    });
  };

  return (
    <div className={`chat-interface grid grid-cols-1 ${compact ? "chat-interface--compact" : "gap-4 lg:grid-cols-[1fr_320px]"}`}>
      <div className={`flex flex-col overflow-hidden border border-slate-200 bg-white ${compact ? "h-full rounded-xl" : "rounded-2xl shadow-sm"}`} style={compact ? undefined : { height: "calc(100vh - 140px)" }}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="AdsFixer" className="h-9 w-9 rounded-full object-cover" />
            <div>
              <p className="text-sm font-bold text-slate-900">AdsFixer LLC</p>
              <p className="text-xs text-green-600">Online now</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={startCall} disabled={!conversation?.assignedStaffId} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Voice call"><Phone size={18} /></button>
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
              <p className="text-xs font-semibold text-slate-600">AdsFixer LLC Support</p>
              <div className="mt-1 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
                Welcome to AdsFixer LLC Support. How can we help you today?
              </div>
            </div>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2">
          {loading && <p className="text-center text-xs text-slate-400">Loading...</p>}
          {messages.map((m) => (
            <ChatMessageBubble key={m.messageId} message={m} isOwn={m.senderId === uid} showSender={m.senderId !== uid} />
          ))}
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
              <p className="text-sm font-semibold text-slate-900">AdsFixer LLC</p>
              <p className="flex items-center gap-1 text-xs text-green-600"><span className="h-2 w-2 rounded-full bg-green-500" /> Online now</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Hours: every day, all day</p>
          <p className="text-xs text-slate-500">You are talking to AdsFixer LLC.</p>
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
