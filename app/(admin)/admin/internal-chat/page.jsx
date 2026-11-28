"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCirclePlus, Phone, Video, Search, RefreshCw, Users, Info, UsersRound } from "lucide-react";
import Swal from "sweetalert2";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import { ROLE_LABELS } from "@/lib/rbacCatalog";
import { setActiveConversation } from "@/lib/activeChat";
import useSSE from "@/app/Component/Hooks/useSSE";
import useChatScroll from "@/app/Component/Hooks/useChatScroll";
import useChatPagination from "@/app/Component/Hooks/useChatPagination";
import { useCentralCall } from "@/app/Component/Chat/CentralCallProvider";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";
import ScrollToLatestButton from "@/app/Component/Chat/ScrollToLatestButton";
import ChatHistoryStatus from "@/app/Component/Chat/ChatHistoryStatus";
import ChatInfoPanel from "@/app/Component/Chat/ChatInfoPanel";
import ChatDateSeparator from "@/app/Component/Chat/ChatDateSeparator";
import { CHAT_PAGE_SIZE, dedupeMessages, mergeOlderMessages, upsertMessage } from "@/lib/chatPagination";
import InternalMessageBubble from "./components/InternalMessageBubble";
import InternalComposer from "./components/InternalComposer";
import NewChatModal from "./components/NewChatModal";
import GroupMembersModal from "./components/GroupMembersModal";
import CallHistoryPanel from "./components/CallHistoryPanel";

const LIST_REFRESH_MS = 120;
const CALL_CACHE_TTL_MS = 60_000;
const MESSAGE_CACHE_TTL_MS = 2 * 60_000;

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function designationOf(person) {
  return person?.designation || ROLE_LABELS[person?.role] || String(person?.role || "Staff").replace(/_/g, " ");
}

// Two shapes reach this helper:
//   - the API's normalized conversation: `unread` is a number (count for me)
//   - a raw document from the internal:conversation SSE event: `unread` is
//     [{ uid, count }]
// Handle both so a user with unread messages never throws.
function unreadOf(conv, uid) {
  if (typeof conv?.unread === "number") return conv.unread;
  if (!Array.isArray(conv?.unread)) return 0;
  const entry = conv.unread.find((u) => u?.uid === uid);
  return typeof entry?.count === "number" ? entry.count : 0;
}

// Normalize a raw conversation document for one participant. The server sends
// every participant's snapshot so each side resolves "peer" independently.
function normalizeConv(conv, uid) {
  if (!conv) return conv;
  if (conv.type === "group") {
    const avatar = conv.avatarAttachmentId
      ? `/api/internal-chat/groups/${encodeURIComponent(conv.conversationId)}/photo?uid=${encodeURIComponent(uid || "")}`
      : null;
    return {
      ...conv,
      isGroup: true,
      peer: { uid: null, displayName: conv.name || "Group", role: "group", avatar },
      unread: unreadOf(conv, uid),
    };
  }
  const people = conv.people || [];
  const peer = people.find((p) => p.uid !== uid) || null;
  return {
    ...conv,
    // Preserve the online flag computed by the API (raw SSE documents have
    // no `peer.online`, so fall back to false until a presence event arrives).
    peer: peer ? { ...peer, designation: designationOf(peer), online: conv.peer?.online ?? false } : null,
    unread: unreadOf(conv, uid),
  };
}

const ConversationItem = React.memo(function ConversationItem({ conv, active, online, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(conv)}
      className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50 ${active ? "bg-orange-50" : ""}`}
    >
      {conv.isGroup ? (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
          <UsersRound size={18} aria-hidden="true" />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white px-1 text-[9px] font-bold text-slate-600">{(conv.participants || []).length}</span>
        </span>
      ) : (
        <ChatParticipantAvatar person={conv.peer} online={online} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{conv.peer?.displayName || (conv.isGroup ? "Group" : "Colleague")}</span>
          <span className="shrink-0 text-[10px] text-slate-400">{conv.pending ? "Opening..." : timeLabel(conv.lastMessageAt)}</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{conv.pending ? "Preparing conversation" : (conv.lastMessage || "No messages yet")}</span>
          {conv.pending ? (
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-orange-300 border-t-orange-500" aria-label="Opening conversation" />
          ) : conv.unread > 0 ? (
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{conv.unread > 99 ? "99+" : conv.unread}</span>
          ) : null}
        </span>
        <span className="block truncate text-[10px] text-slate-400">{conv.isGroup ? `${(conv.participants || []).length} members` : designationOf(conv.peer)}</span>
      </span>
    </button>
  );
});

export default function InternalChatPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const call = useCentralCall();

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [calls, setCalls] = useState([]);
  const [search, setSearch] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [groupModal, setGroupModal] = useState(null); // { mode: "create" | "add" }
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [error, setError] = useState("");
  const [typingPeer, setTypingPeer] = useState(false);
  const [onlineMap, setOnlineMap] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  const listRef = useRef(null);
  const messagesRef = useRef(messages);
  const replyToRef = useRef(replyTo);
  const highlightTimerRef = useRef(null);
  const searchRef = useRef("");
  const selectedRef = useRef(null);
  const activeIdRef = useRef(null);
  const conversationsRef = useRef([]);
  const onlineRef = useRef({});
  const typingTimeoutRef = useRef(null);
  const listLoadedRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const openSeqRef = useRef(0);

  // Caches and in-flight maps (refs: no re-renders when they change).
  const messageCacheRef = useRef(new Map());
  const callsCacheRef = useRef(new Map());
  const pendingPayloadRef = useRef(new Map());
  const pendingConvRef = useRef(new Map());

  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { replyToRef.current = replyTo; }, [replyTo]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { onlineRef.current = onlineMap; }, [onlineMap]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    setActiveConversation(selected?.pending ? null : selected?.conversationId, "internal");
    return () => setActiveConversation(null, null);
  }, [selected?.conversationId, selected?.pending]);

  const api = useCallback(async (url, options = {}) => {
    const res = await authFetch(url, options, user);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
    return data;
  }, [user]);

  const fetchPage = useCallback(async ({ before, limit }) => {
    const cid = activeIdRef.current;
    if (!cid) return { messages: [], hasMore: false, nextCursor: null };
    const url = `/api/internal-chat/conversations/${encodeURIComponent(cid)}/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
    return api(url);
  }, [api]);

  const {
    hasOlder,
    loadingOlder,
    applyPage,
    loadOlder,
    restorePage,
    getState,
  } = useChatPagination({ key: selected?.conversationId, fetchPage, enabled: Boolean(uid) });

  const handleLoadOlder = useCallback(async () => {
    const older = await loadOlder();
    if (!older?.length) return;
    setMessages((prev) => {
      const merged = mergeOlderMessages(prev, older);
      const cid = activeIdRef.current;
      if (cid) messageCacheRef.current.set(cid, { ...getState(), messages: merged, at: Date.now() });
      return merged;
    });
  }, [loadOlder, getState]);

  const { showScrollToLatest, handleScroll, scrollToLatest, pinToBottom, bottomRef, listRefCallback } = useChatScroll({
    listRef,
    messages,
    conversationKey: selected?.conversationId,
    loading: loadingThread,
    activityKey: typingPeer,
    onLoadOlder: handleLoadOlder,
    hasOlder,
    loadingOlder,
  });

  const loadConversations = useCallback(async () => {
    if (!uid) return;
    if (!listLoadedRef.current) setLoadingList(true);
    try {
      const data = await api(`/api/internal-chat/conversations?search=${encodeURIComponent(searchRef.current)}&limit=50`);
      const fresh = (data.items || []).map((c) => normalizeConv(c, uid));
      // Keep locally pending conversations visible until the server confirms.
      setConversations((prev) => {
        const pending = prev.filter((c) => c.pending && !fresh.some((f) => f.conversationId === c.conversationId));
        return [...fresh, ...pending];
      });
      setError("");
    } catch (err) {
      setError(err.message || "Could not load conversations");
    } finally {
      listLoadedRef.current = true;
      setLoadingList(false);
    }
  }, [api, uid]);

  // Coalesce the many SSE-driven refreshes into one request.
  const scheduleListRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      loadConversations();
    }, LIST_REFRESH_MS);
  }, [loadConversations]);

  const loadCalls = useCallback(async (conversationId, force = false) => {
    if (!conversationId) return;
    const cached = callsCacheRef.current.get(conversationId);
    if (!force && cached && Date.now() - cached.at < CALL_CACHE_TTL_MS) {
      setCalls(cached.calls);
      return;
    }
    setLoadingCalls(true);
    try {
      const data = await api(`/api/internal-chat/calls?conversationId=${encodeURIComponent(conversationId)}&limit=30`);
      const list = data.calls || [];
      callsCacheRef.current.set(conversationId, { calls: list, at: Date.now() });
      if (activeIdRef.current === conversationId) setCalls(list);
    } catch {
      if (activeIdRef.current === conversationId) setCalls([]);
    } finally {
      setLoadingCalls(false);
    }
  }, [api]);

  const openConversation = useCallback(async (conv, { markRead = true, force = false } = {}) => {
    if (!conv?.conversationId) return;
    const cid = conv.conversationId;
    const seq = ++openSeqRef.current;
    activeIdRef.current = cid;
    selectedRef.current = conv;
    setSelected(conv);
    setReplyTo(null);
    setInfoOpen(false);
    setTypingPeer(false);
    pinToBottom();

    // Instant switch: render cached messages (or an empty thread + skeleton).
    const cached = !force ? messageCacheRef.current.get(cid) : null;
    const hasCache = cached && Date.now() - cached.at < MESSAGE_CACHE_TTL_MS;
    setMessages(hasCache ? cached.messages : []);
    restorePage(hasCache ? { cursor: cached.cursor, hasMore: cached.hasOlder } : {});
    setLoadingThread(!hasCache && !conv.pending);
    const cachedCalls = callsCacheRef.current.get(cid);
    setCalls(cachedCalls && Date.now() - cachedCalls.at < CALL_CACHE_TTL_MS ? cachedCalls.calls : []);
    if (!cachedCalls || Date.now() - cachedCalls.at >= CALL_CACHE_TTL_MS) loadCalls(cid);

    // Messages and call history are independent: fetch in parallel.
    try {
      const data = await api(`/api/internal-chat/conversations/${encodeURIComponent(cid)}/messages?limit=${CHAT_PAGE_SIZE}`);
      if (seq !== openSeqRef.current) return; // user switched again; ignore stale result
      const list = applyPage(data);
      messageCacheRef.current.set(cid, { ...getState(), messages: list, at: Date.now() });
      setMessages(list);
      setLoadingThread(false);
    } catch (err) {
      if (seq === openSeqRef.current) setError(err.message || "Could not load messages");
    } finally {
      if (seq === openSeqRef.current) setLoadingThread(false);
    }
    if (markRead && !conv.pending) {
      api("/api/internal-chat/read", { method: "POST", body: JSON.stringify({ conversationId: cid }) }).catch(() => {});
    }
    scheduleListRefresh();
  }, [api, loadCalls, scheduleListRefresh, pinToBottom, applyPage, restorePage, getState]);

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
    const params = new URLSearchParams({ kind, limit: String(limit) });
    if (before) params.set("before", before);
    const data = await api(`/api/internal-chat/conversations/${encodeURIComponent(selected?.conversationId || "")}/shared?${params}`);
    return data;
  }, [api, selected?.conversationId]);

  const getAttachmentUrl = useCallback((attachment) =>
    `/api/internal-chat/attachments?attachmentId=${encodeURIComponent(attachment?.id || "")}&conversationId=${encodeURIComponent(selected?.conversationId || "")}&uid=${encodeURIComponent(uid || "")}`,
  [selected?.conversationId, uid]);

  // Keep the active cache current for messages sent/received while viewing.
  // Preserve the pagination cursor / hasOlder flag stored alongside it.
  useEffect(() => {
    const cid = activeIdRef.current;
    if (cid) {
      const cached = messageCacheRef.current.get(cid);
      messageCacheRef.current.set(cid, { ...cached, messages, at: Date.now() });
    }
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(loadConversations, 300);
    return () => clearTimeout(timer);
  }, [loadConversations, search]);

  useEffect(() => () => {
    clearTimeout(typingTimeoutRef.current);
    clearTimeout(refreshTimerRef.current);
    clearTimeout(highlightTimerRef.current);
  }, []);

  // SSE reconnect: refresh only the newest page. Older pages already loaded
  // higher up are kept (and deduped), so reading position is not discarded.
  const refreshActiveMessages = useCallback(async () => {
    const cid = activeIdRef.current;
    if (!cid) return;
    try {
      const data = await api(`/api/internal-chat/conversations/${encodeURIComponent(cid)}/messages?limit=${CHAT_PAGE_SIZE}`);
      const fresh = applyPage(data);
      setMessages((prev) => {
        const freshKeys = new Set(fresh.map((m) => m.clientId || m.messageId));
        const pendingOnly = prev.filter((m) =>
          m.status && m.messageId?.startsWith("tmp_") && !freshKeys.has(m.clientId || m.messageId));
        const oldestFresh = fresh[0]?.createdAt;
        const earlier = oldestFresh
          ? prev.filter((m) => new Date(m.createdAt) < new Date(oldestFresh))
          : [];
        return dedupeMessages([...earlier, ...fresh, ...pendingOnly])
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
    } catch {}
  }, [api, applyPage]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "internal:presence" && data?.uid) {
        setOnlineMap((prev) => ({ ...prev, [data.uid]: Boolean(data.online) }));
      }
      if (type === "internal:conversation" && data?.conversation) {
        const normalized = normalizeConv(data.conversation, uid);
        setConversations((prev) => prev.some((c) => c.conversationId === normalized.conversationId) ? prev : [normalized, ...prev]);
      }
      if (type === "internal:message" && data?.message) {
        if (data.conversationId === activeIdRef.current) {
          setMessages((prev) => upsertMessage(prev, { ...data.message, status: "sent" }));
        }
        scheduleListRefresh();
        if (data.message.messageType === "call_event") loadCalls(data.conversationId, true);
      }
      if (type === "internal:read" && data?.uid) {
        setMessages((prev) => prev.map((m) => m.senderId === data.uid && !(m.readBy || []).includes(data.uid)
          ? { ...m, readBy: [...(m.readBy || []), data.uid] }
          : m));
        scheduleListRefresh();
      }
      if (type === "internal:typing" && data?.conversationId === activeIdRef.current && data.uid !== uid) {
        setTypingPeer(Boolean(data.typing));
        clearTimeout(typingTimeoutRef.current);
        if (data.typing) typingTimeoutRef.current = setTimeout(() => setTypingPeer(false), 3000);
      }
      if (type === "internal:call") {
        scheduleListRefresh();
        if (data?.conversationId === activeIdRef.current) loadCalls(data.conversationId, true);
      }
      if (type === "internal:reaction" && data?.messageId) {
        setMessages((prev) => prev.map((message) => message.messageId === data.messageId
          ? { ...message, reactions: data.reactions || [] }
          : message));
      }
      if (type === "internal:group" && data?.conversationId) {
        if (["deleted", "deleted-for-me", "member-removed", "member-left"].includes(data.action)) {
          const removedUid = data.removedUid || data.byUid;
          if (data.action === "deleted-for-me" || data.action === "deleted") {
            setConversations((prev) => prev.filter((c) => c.conversationId !== data.conversationId));
            if (activeIdRef.current === data.conversationId) {
              activeIdRef.current = null;
              selectedRef.current = null;
              setSelected(null);
              setMessages([]);
            }
          } else if (removedUid === uid && activeIdRef.current === data.conversationId) {
            activeIdRef.current = null;
            selectedRef.current = null;
            setSelected(null);
            setMessages([]);
          }
        } else if (data.conversation) {
          const normalized = normalizeConv(data.conversation, uid);
          setConversations((prev) => prev.some((c) => c.conversationId === normalized.conversationId)
            ? prev.map((c) => c.conversationId === normalized.conversationId ? normalized : c)
            : [normalized, ...prev]);
          if (activeIdRef.current === normalized.conversationId) {
            selectedRef.current = normalized;
            setSelected(normalized);
          }
        }
        scheduleListRefresh();
      }
    },
    // Reconnect: reconcile anything missed while the stream was down.
    onReconnect: () => {
      setOnlineMap({});
      loadConversations();
      refreshActiveMessages();
      if (activeIdRef.current) loadCalls(activeIdRef.current, true);
    },
  });

  const startConversation = useCallback((peerInput) => {
    const peer = typeof peerInput === "string"
      ? { uid: peerInput, displayName: "User", role: "staff" }
      : (peerInput || {});
    const peerUid = peer.uid;
    if (!peerUid || peerUid === uid) return Promise.resolve(null);

    // Rapid clicks on the same person reuse one in-flight request.
    if (pendingConvRef.current.has(peerUid)) return pendingConvRef.current.get(peerUid);

    const existing = conversationsRef.current.find((c) => c.peer?.uid === peerUid && !c.pending);
    if (existing) {
      openConversation(existing);
      return Promise.resolve(existing);
    }

    const self = {
      uid,
      displayName: user?.displayName || user?.email || "You",
      email: user?.email || "",
      role: "staff",
      avatar: user?.photoURL || null,
    };
    const peerSnapshot = { ...peer, designation: designationOf(peer) };
    const temp = {
      conversationId: `temp_${peerUid}`,
      pending: true,
      participants: [uid, peerUid],
      people: [self, peer],
      peer: peerSnapshot,
      unread: 0,
      lastMessage: "",
      lastMessageAt: new Date().toISOString(),
    };
    setConversations((prev) => [temp, ...prev.filter((c) => c.conversationId !== temp.conversationId)]);
    openConversation(temp);

    const promise = (async () => {
      try {
        const data = await api("/api/internal-chat/conversations", {
          method: "POST",
          body: JSON.stringify({ peerUid }),
        });
        const real = normalizeConv(data.conversation, uid);
        const cached = messageCacheRef.current.get(temp.conversationId);
        if (cached) messageCacheRef.current.set(real.conversationId, cached);
        setConversations((prev) => [
          real,
          ...prev.filter((c) => c.conversationId !== temp.conversationId && c.conversationId !== real.conversationId),
        ]);
        if (activeIdRef.current === temp.conversationId || activeIdRef.current === real.conversationId) {
          openConversation(real);
        }
        return real;
      } catch (err) {
        setConversations((prev) => prev.filter((c) => c.conversationId !== temp.conversationId));
        if (activeIdRef.current === temp.conversationId) {
          activeIdRef.current = null;
          selectedRef.current = null;
          setSelected(null);
          setMessages([]);
        }
        Swal.fire({
          toast: true, position: "top-end", icon: "error",
          title: err.message || "Could not open conversation", timer: 4000, showConfirmButton: false,
        });
        throw err;
      } finally {
        pendingConvRef.current.delete(peerUid);
      }
    })();
    pendingConvRef.current.set(peerUid, promise);
    return promise;
  }, [api, openConversation, uid, user]);

  const sendMessage = useCallback(async (payload) => {
    const conv = selectedRef.current;
    if (!conv || conv.pending) throw new Error("Conversation is still opening");
    const clientId = payload.clientId || `c_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const temp = {
      messageId: `tmp_${clientId}`,
      clientId,
      conversationId: conv.conversationId,
      senderId: uid,
      senderNameSnapshot: user?.displayName || user?.email || "You",
      senderAvatar: user?.photoURL || null,
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
    scheduleListRefresh();

    try {
      const data = await api("/api/internal-chat/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: conv.conversationId, ...payload, clientId }),
      });
      pendingPayloadRef.current.delete(clientId);
      setMessages((prev) => prev.map((m) => m.clientId === clientId
        ? { ...data.message, status: "sent" }
        : m));
      scheduleListRefresh();
      return data.message;
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.clientId === clientId
        ? { ...m, status: "failed", error: err.message }
        : m));
      throw err;
    }
  }, [api, scheduleListRefresh, uid, user, pinToBottom]);

  const retryMessage = useCallback((message) => {
    const payload = pendingPayloadRef.current.get(message.clientId);
    if (!payload) return;
    setMessages((prev) => prev.map((m) => m.clientId === message.clientId ? { ...m, status: "sending" } : m));
    sendMessage({ ...payload, clientId: message.clientId }).catch(() => {});
  }, [sendMessage]);

  const reactToMessage = useCallback(async (message, emoji) => {
    const conv = selectedRef.current;
    if (!conv || !message?.messageId) return;
    const current = messagesRef.current.find((m) => m.messageId === message.messageId)?.reactions || [];
    const mine = current.find((r) => r.uid === uid && r.emoji === emoji);
    const optimistic = mine ? current.filter((r) => r !== mine) : [...current, { uid, emoji, at: new Date().toISOString() }];
    setMessages((prev) => prev.map((m) => m.messageId === message.messageId ? { ...m, reactions: optimistic } : m));
    try {
      const data = await api("/api/internal-chat/reactions", {
        method: "POST",
        body: JSON.stringify({ conversationId: conv.conversationId, messageId: message.messageId, emoji }),
      });
      setMessages((prev) => prev.map((m) => m.messageId === message.messageId ? { ...m, reactions: data.reactions || [] } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.messageId === message.messageId ? { ...m, reactions: current } : m));
    }
  }, [api, uid]);

  const createGroup = useCallback(async ({ name, description, memberUids, photo }) => {
    const data = await api("/api/internal-chat/groups", {
      method: "POST",
      body: JSON.stringify({ name, description, memberUids }),
    });
    let conversation = normalizeConv(data.conversation, uid);
    if (photo) {
      const form = new FormData();
      form.append("file", photo);
      const res = await authFetch(`/api/internal-chat/groups/${encodeURIComponent(conversation.conversationId)}/photo`, { method: "POST", body: form }, user);
      const photoData = await res.json().catch(() => ({}));
      if (res.ok && photoData.conversation) conversation = normalizeConv(photoData.conversation, uid);
      else if (!res.ok) throw new Error(photoData.message || "Could not upload group photo");
    }
    setConversations((prev) => [conversation, ...prev.filter((c) => c.conversationId !== conversation.conversationId)]);
    openConversation(conversation);
    return conversation;
  }, [api, uid, user, openConversation]);

  const addGroupMembers = useCallback(async (memberUids) => {
    const conv = selectedRef.current;
    if (!conv?.isGroup) return;
    const data = await api(`/api/internal-chat/groups/${encodeURIComponent(conv.conversationId)}/members`, {
      method: "POST",
      body: JSON.stringify({ uids: memberUids }),
    });
    const normalized = normalizeConv(data.conversation, uid);
    setConversations((prev) => prev.map((c) => c.conversationId === normalized.conversationId ? normalized : c));
    setSelected(normalized);
    selectedRef.current = normalized;
  }, [api, uid]);

  const groupAction = useCallback(async (action, payload) => {
    const conv = selectedRef.current;
    if (!conv?.isGroup) return;
    const base = `/api/internal-chat/groups/${encodeURIComponent(conv.conversationId)}`;
    try {
      if (action === "add-members") { setGroupModal({ mode: "add" }); return; }
      if (action === "details") {
        await api(base, { method: "PATCH", body: JSON.stringify(payload) });
      } else if (action === "photo") {
        const form = new FormData();
        form.append("file", payload);
        const res = await authFetch(`${base}/photo`, { method: "POST", body: form }, user);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || "Could not update group photo");
      } else if (action === "remove" || action === "role") {
        const url = action === "remove" ? `${base}/members?uid=${encodeURIComponent(payload)}` : `${base}/members`;
        const options = action === "remove"
          ? { method: "DELETE" }
          : { method: "PATCH", body: JSON.stringify(payload) };
        await api(url, options);
      } else if (action === "leave" || action === "delete") {
        const confirmed = await Swal.fire({
          title: action === "delete" ? "Delete this group?" : "Leave this group?",
          text: action === "delete" ? "Messages and call history in this group will be removed. This cannot be undone." : "You will no longer receive messages from this group.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#dc2626",
          confirmButtonText: action === "delete" ? "Delete group" : "Leave group",
        });
        if (!confirmed.isConfirmed) return;
        await api(action === "delete" ? base : `${base}/leave`, { method: action === "delete" ? "DELETE" : "POST" });
        setConversations((prev) => prev.filter((c) => c.conversationId !== conv.conversationId));
        activeIdRef.current = null;
        selectedRef.current = null;
        setSelected(null);
        setMessages([]);
        return;
      }
      const fresh = await api(`/api/internal-chat/conversations?limit=50`);
      const match = (fresh.items || []).find((c) => c.conversationId === conv.conversationId);
      if (match) {
        const normalized = normalizeConv(match, uid);
        setConversations((prev) => prev.map((c) => c.conversationId === normalized.conversationId ? normalized : c));
        setSelected(normalized);
        selectedRef.current = normalized;
      }
    } catch (error) {
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: error.message || "Could not update group", timer: 4000, showConfirmButton: false });
    }
  }, [api, uid, user]);

  const notifyTyping = useCallback(async (typing) => {
    const conv = selectedRef.current;
    if (!conv || conv.pending) return;
    try {
      await api("/api/internal-chat/typing", {
        method: "POST",
        body: JSON.stringify({ conversationId: conv.conversationId, typing }),
      });
    } catch {
      // Typing is best-effort and never blocks sending.
    }
  }, [api]);

  const startCall = useCallback((callType) => {
    const conv = selectedRef.current;
    if (!conv?.peer?.uid || conv.pending) return;
    call?.startCall({
      conversationId: conv.conversationId,
      targetUid: conv.peer.uid,
      targetName: conv.peer.displayName,
      targetAvatar: conv.peer.avatar,
      callType,
      system: "internal",
    });
  }, [call]);

  const onlineStatus = useMemo(() => {
    const map = {};
    for (const conv of conversations) {
      const peerUid = conv.peer?.uid;
      if (peerUid) map[conv.conversationId] = onlineMap[peerUid] ?? conv.peer?.online ?? false;
    }
    return map;
  }, [conversations, onlineMap]);

  const peerOnline = selected?.peer ? (onlineRef.current[selected.peer.uid] ?? selected.peer.online) : false;

  return (
    <div className="internal-chat flex h-[calc(100vh-120px)] min-h-[520px] gap-3">
      {/* Conversation list */}
      <aside className={`w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:w-80 ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-slate-200 p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none" />
          </div>
          <button type="button" onClick={() => setDirectoryOpen(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600">
            <MessageCirclePlus size={16} /> New conversation
          </button>
          <button type="button" onClick={() => setGroupModal({ mode: "create" })} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50">
            <UsersRound size={16} /> New group
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="animate-pulse rounded-xl bg-slate-100 p-3"><div className="h-4 w-2/3 rounded bg-slate-200" /></div>)}
            </div>
          )}
          {!loadingList && error && (
            <div className="p-4 text-center">
              <p className="text-xs text-red-500">{error}</p>
              <button onClick={loadConversations} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><RefreshCw size={12} /> Retry</button>
            </div>
          )}
          {!loadingList && !error && conversations.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-slate-400">
              <Users size={28} />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Start one with an admin or staff member.</p>
            </div>
          )}
          {!loadingList && conversations.map((conv) => (
            <ConversationItem
              key={conv.conversationId}
              conv={conv}
              active={selected?.conversationId === conv.conversationId}
              online={onlineStatus[conv.conversationId]}
              onOpen={openConversation}
            />
          ))}
        </div>
      </aside>

      {/* Thread */}
      <section className={`min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${selected ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <>
            <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-3 sm:px-4">
              <button type="button" onClick={() => { setSelected(null); selectedRef.current = null; activeIdRef.current = null; }} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Back to conversations"><ArrowLeft size={18} /></button>
              {selected.isGroup ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700"><UsersRound size={19} aria-hidden="true" /></span>
              ) : (
                <ChatParticipantAvatar person={selected.peer} size="h-10 w-10" online={peerOnline} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{selected.peer?.displayName || "Colleague"}</p>
                <p className="truncate text-xs text-slate-500">
                  {selected.pending ? <span className="text-orange-600">Opening conversation...</span>
                    : selected.isGroup ? `${(selected.participants || []).length} members${typingPeer ? " · typing..." : ""}`
                    : typingPeer ? <span className="text-orange-600">typing...</span>
                    : `${designationOf(selected.peer)}${peerOnline ? " · Online" : " · Offline"}`}
                </p>
              </div>
              <button type="button" onClick={() => startCall("voice")} disabled={selected.pending || selected.isGroup} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label="Voice call"><Phone size={18} /></button>
              <button type="button" onClick={() => startCall("video")} disabled={selected.pending || selected.isGroup} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label="Video call"><Video size={18} /></button>
              <button type="button" onClick={() => setInfoOpen((open) => !open)} disabled={selected.pending} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-40" aria-label="Shared conversation information" aria-expanded={infoOpen}><Info size={18} /></button>
            </header>
            <div className="relative min-h-0 flex-1">
              <div ref={listRefCallback} onScroll={handleScroll} className="h-full overflow-y-auto bg-slate-50 px-3 py-3 sm:px-4">
                <ChatHistoryStatus loadingOlder={loadingOlder} showBeginning={!hasOlder && !loadingThread && messages.length > 0} />
                {hasOlder && !loadingThread && !loadingOlder && (
                  <div className="mb-3 flex justify-center">
                    <button
                      type="button"
                      onClick={handleLoadOlder}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm hover:bg-slate-50"
                    >
                      Load earlier messages
                    </button>
                  </div>
                )}
                {loadingThread && (
                  <div className="space-y-3" aria-label="Loading messages">
                    {[0, 1, 2].map((i) => <div key={i} className={`h-12 w-2/3 animate-pulse rounded-2xl bg-slate-200 ${i % 2 ? "ml-auto" : ""}`} />)}
                  </div>
                )}
                {!loadingThread && messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                    <Users size={28} />
                    <p className="mt-2 text-sm">No messages yet</p>
                    <p className="text-xs">Say hello to {selected.peer?.displayName || "your colleague"}.</p>
                  </div>
                )}
                {!loadingThread && messages.map((m, index) => {
                  const previous = messages[index - 1];
                  const changedDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                  return (
                    <React.Fragment key={m.clientId || m.messageId}>
                      {changedDay && <ChatDateSeparator value={m.createdAt} />}
                      <InternalMessageBubble
                        message={m}
                        isOwn={m.senderId === uid}
                        showSender={m.senderId !== uid}
                        senderOnline={m.senderId !== uid && peerOnline}
                        conversationId={selected.conversationId}
                        uid={uid}
                        onRetry={retryMessage}
                        onReply={setReplyTo}
                        onJumpToMessage={jumpToMessage}
                        highlighted={highlightedMessageId === m.messageId}
                        onReact={reactToMessage}
                        showSenderName={Boolean(selected.isGroup)}
                      />
                    </React.Fragment>
                  );
                })}
                <div ref={bottomRef} aria-hidden="true" />
              </div>
              <ScrollToLatestButton visible={showScrollToLatest} onClick={() => scrollToLatest()} />
              {infoOpen && <ChatInfoPanel
                conversationKey={selected.conversationId}
                fetchPage={fetchSharedPage}
                getAttachmentUrl={getAttachmentUrl}
                onClose={() => setInfoOpen(false)}
                group={selected.isGroup ? selected : null}
                uid={uid}
                onlineMap={onlineMap}
                canManage={Boolean(selected.isGroup && (selected.admins || []).includes(uid))}
                onGroupAction={groupAction}
              />}
            </div>
            <InternalComposer onSend={sendMessage} onTyping={notifyTyping} disabled={selected.pending} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Users size={36} />
            <p className="text-sm">Select a conversation to start chatting</p>
            <button type="button" onClick={() => setDirectoryOpen(true)} className="mt-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600">Start a new conversation</button>
          </div>
        )}
      </section>

      {/* Peer info + call history */}
      {selected && (
        <aside className="hidden w-64 shrink-0 space-y-3 overflow-y-auto xl:block">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">About</h3>
            <div className="mt-3 flex flex-col items-center text-center">
              <ChatParticipantAvatar person={selected.peer} size="h-14 w-14" online={peerOnline} />
              <p className="mt-2 text-sm font-semibold text-slate-900">{selected.peer?.displayName}</p>
              <p className="text-xs text-slate-500">{designationOf(selected.peer)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{selected.peer?.email}</p>
            </div>
          </div>
          <CallHistoryPanel calls={calls} loading={loadingCalls} />
        </aside>
      )}

      <NewChatModal
        key={directoryOpen ? "directory-open" : "directory-closed"}
        open={directoryOpen}
        onClose={() => setDirectoryOpen(false)}
        onSelect={startConversation}
      />
      <GroupMembersModal
        key={groupModal ? `${groupModal.mode}-open` : "group-closed"}
        open={Boolean(groupModal)}
        mode={groupModal?.mode || "create"}
        group={selected}
        api={api}
        onClose={() => setGroupModal(null)}
        onSubmit={async ({ name, description, memberUids, photo }) => {
          if (groupModal?.mode === "create") return createGroup({ name, description, memberUids, photo });
          return addGroupMembers(memberUids);
        }}
      />
    </div>
  );
}
