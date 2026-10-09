"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSSE from "@/app/Component/Hooks/useSSE";
import { useNotificationSound } from "@/app/Component/Notifications/useNotificationSound";
import { useAdmin } from "./AdminProvider";

// Persistent notification-log provider for staff/admin. Single source of
// truth is GET /api/notifications?uid= (MongoDB); the client never derives
// counts itself. Sound plays only for live SSE arrivals of unseen, unread
// notifications — polling/focus refreshes stay silent.
const NotificationContext = createContext({
  unread: 0,
  items: [],
  total: 0,
  lastEventSeq: 0,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  markReadByRef: async () => {},
  soundOn: true,
  toggleSound: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const POLL_MS = 60000;
const DROPDOWN_LIMIT = 20;

export default function NotificationProvider({ children }) {
  const { profile } = useAdmin();
  const uid = profile?.uid || null;

  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [lastEventSeq, setLastEventSeq] = useState(0);
  const { soundOn, toggleSound, playFor } = useNotificationSound();

  const applyState = useCallback((data) => {
    if (!data || data.success === false) return;
    if (typeof data.unread === "number") setUnread(data.unread);
    if (Array.isArray(data.notifications)) setItems(data.notifications);
    if (typeof data.total === "number") setTotal(data.total);
  }, []);

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(
        `/api/notifications?uid=${encodeURIComponent(uid)}&limit=${DROPDOWN_LIMIT}`,
        { cache: "no-store" }
      );
      applyState(await res.json());
    } catch {
      // Keep last known values; next event/poll/focus retries.
    }
  }, [uid, applyState]);

  useEffect(() => {
    if (!uid) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid, refresh]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type !== "notify") return;
      if (data?.notification) playFor(data.notification);
      refresh();
      setLastEventSeq((s) => s + 1);
    },
  });

  // Mark one log row read; when it references a ticket, also mark that
  // ticket read for this staff member so both badges stay in sync.
  const markRead = useCallback(async (id, opts = {}) => {
    if (!uid || !id) return;
    const nid = String(id);
    setItems((prev) => prev.map((n) => (String(n._id) === nid ? { ...n, read: true } : n)));
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, ids: [nid] }),
      });
      const data = await res.json();
      if (typeof data.unread === "number") setUnread(data.unread);
      else refresh();
    } catch {
      refresh();
    }
    if (opts.ticketDbId) {
      try {
        await fetch("/api/admin/support-tickets/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, ticketIds: [String(opts.ticketDbId)] }),
        });
      } catch { /* ticket badge reconciles via its own provider */ }
    }
  }, [uid, refresh]);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, all: true }),
      });
      const data = await res.json();
      if (typeof data.unread === "number") setUnread(data.unread);
      applyState(data);
    } catch {
      refresh();
    }
    // Bell "mark all" also clears ticket markers so the sidebar ticket
    // badge stays in sync with what was just marked seen.
    try {
      await fetch("/api/admin/support-tickets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, all: true }),
      });
    } catch { /* ticket badge reconciles via its own provider */ }
  }, [uid, applyState, refresh]);

  // Mark every log row for one ticket/deposit as read (e.g. the user just
  // opened that ticket). Updates the bell instantly from the server count.
  const markReadByRef = useCallback(async (refType, refId) => {
    if (!uid || !refType || !refId) return;
    const rid = String(refId);
    setItems((prev) => prev.map((n) => (n.refType === refType && String(n.refId) === rid ? { ...n, read: true } : n)));
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, refType, refId: rid }),
      });
      const data = await res.json();
      if (typeof data.unread === "number") setUnread(data.unread);
      else refresh();
    } catch {
      refresh();
    }
  }, [uid, refresh]);

  return (
    <NotificationContext.Provider
      value={{ unread, items, total, lastEventSeq, refresh, markRead, markAllRead, markReadByRef, soundOn, toggleSound }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
