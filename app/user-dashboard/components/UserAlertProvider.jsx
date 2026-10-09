"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSSE from "@/app/Component/Hooks/useSSE";
import { useNotificationSound } from "@/app/Component/Notifications/useNotificationSound";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

// Customer-side alert provider: mirrors the admin notification experience.
// - `unread`/`items`: persistent notification log (tickets + deposits).
// - `ticketUnread`/`ticketSeq`: ticket list read state; bumps when a ticket
//   event arrives so the list refreshes.
// - `depositSeq`: bumps when a deposit event arrives.
// Sound plays only for live, unseen, unread arrivals (never for polls).
const UserAlertContext = createContext({
  unread: 0,
  items: [],
  total: 0,
  ticketUnread: 0,
  ticketSeq: 0,
  depositSeq: 0,
  notifSeq: 0,
  refresh: async () => {},
  refreshTickets: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  markReadByRef: async () => {},
  markReadByTypes: async () => {},
  markTicketRead: async () => {},
  soundOn: true,
  toggleSound: () => {},
});

export function useUserAlerts() {
  return useContext(UserAlertContext);
}

const POLL_MS = 60000;
const DROPDOWN_LIMIT = 20;

export default function UserAlertProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid || null;

  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [ticketUnread, setTicketUnread] = useState(0);
  const [ticketSeq, setTicketSeq] = useState(0);
  const [depositSeq, setDepositSeq] = useState(0);
  const [notifSeq, setNotifSeq] = useState(0);
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

  const refreshTickets = useCallback(async () => {
    if (!uid) return 0;
    try {
      const res = await fetch(`/api/user/support-tickets?uid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      const data = await res.json();
      const list = data.tickets || [];
      setTicketUnread(list.filter((t) => t.unread).length);
      return list;
    } catch {
      return [];
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    refresh();
    refreshTickets();
    const id = setInterval(() => { refresh(); refreshTickets(); }, POLL_MS);
    const onFocus = () => { refresh(); refreshTickets(); };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid, refresh, refreshTickets]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type !== "notify") return;
      if (data?.notification) playFor(data.notification);
      refresh();
      setNotifSeq((s) => s + 1);
      const refType = data?.notification?.refType;
      if (refType === "ticket") {
        refreshTickets();
        setTicketSeq((s) => s + 1);
      } else if (refType === "deposit") {
        setDepositSeq((s) => s + 1);
      } else {
        refreshTickets();
        setTicketSeq((s) => s + 1);
        setDepositSeq((s) => s + 1);
      }
    },
  });

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
        await fetch("/api/user/support-tickets/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, ticketIds: [String(opts.ticketDbId)] }),
        });
        refreshTickets();
      } catch { /* ticket badge reconciles on next refresh */ }
    }
  }, [uid, refresh, refreshTickets]);

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
      await fetch("/api/user/support-tickets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, all: true }),
      });
      refreshTickets();
    } catch { /* ticket badge reconciles on next refresh */ }
  }, [uid, applyState, refresh, refreshTickets]);

  // Mark every log row for one ticket/deposit as read (e.g. the customer
  // just opened that ticket). Updates the bell instantly from the server.
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

  // Mark every unread log row of the given types as read (e.g. all
  // ticket logs when "mark all read" is pressed on the tickets page).
  const markReadByTypes = useCallback(async (types) => {
    if (!uid || !Array.isArray(types) || types.length === 0) return;
    setItems((prev) => prev.map((n) => (types.includes(n.type) ? { ...n, read: true } : n)));
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, types }),
      });
      const data = await res.json();
      if (typeof data.unread === "number") setUnread(data.unread);
      else refresh();
    } catch {
      refresh();
    }
  }, [uid, refresh]);

  // Mark ticket(s) read for the customer (viewing a ticket clears its
  // unread state for them only — staff state is untouched).
  const markTicketRead = useCallback(async (ticketDbId) => {
    if (!uid || !ticketDbId) return;
    try {
      const res = await fetch("/api/user/support-tickets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, ticketIds: [String(ticketDbId)] }),
      });
      const data = await res.json();
      if (typeof data.unread === "number") setTicketUnread(data.unread);
      else refreshTickets();
    } catch {
      refreshTickets();
    }
  }, [uid, refreshTickets]);

  return (
    <UserAlertContext.Provider
      value={{ unread, items, total, ticketUnread, ticketSeq, depositSeq, notifSeq, refresh, refreshTickets, markRead, markAllRead, markReadByRef, markReadByTypes, markTicketRead, soundOn, toggleSound }}
    >
      {children}
    </UserAlertContext.Provider>
  );
}
