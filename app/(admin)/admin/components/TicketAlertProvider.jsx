"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSSE from "@/app/Component/Hooks/useSSE";
import { hasPermission } from "@/lib/permissions";
import { useAdmin } from "./AdminProvider";

// Single source of truth for the badge is the server (`supportTicketReads`
// + unresolved tickets in MongoDB). The client never increments, decrements,
// or derives the count itself — every event, poll, focus, or read action
// reconciles against GET /api/admin/support-tickets/count?uid= (or the
// POST /read response). This makes duplicates, clock skew, stale localStorage,
// and multi-tab races impossible: the displayed number always equals the DB.
const TicketAlertContext = createContext({
  canView: false,
  unread: 0,
  items: [],
  pendingOpen: 0,
  byStage: {},
  totalUnread: 0,
  stageTotals: {},
  totalTickets: 0,
  lastEventSeq: 0,
  lastTicketId: null,
  markAllRead: async () => {},
  markRead: async () => {},
  refresh: async () => {},
});

export function useTicketAlerts() {
  return useContext(TicketAlertContext);
}

const POLL_MS = 60000;

export default function TicketAlertProvider({ children }) {
  const { profile, access } = useAdmin();
  const role = profile?.role || "customer";
  const uid = profile?.uid || null;
  const canView =
    hasPermission(role, "view_tickets", access?.permissions) ||
    hasPermission(role, "manage_tickets", access?.permissions);

  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [pendingOpen, setPendingOpen] = useState(0);
  const [byStage, setByStage] = useState({});
  const [stageTotals, setStageTotals] = useState({});
  const [totalTickets, setTotalTickets] = useState(0);
  const [lastEventSeq, setLastEventSeq] = useState(0);
  const [lastTicketId, setLastTicketId] = useState(null);

  const applyState = useCallback((data) => {
    if (!data || data.success === false) return;
    if (typeof data.unread === "number") setUnread(data.unread);
    if (Array.isArray(data.items)) setItems(data.items);
    if (typeof data.pendingOpen === "number") setPendingOpen(data.pendingOpen);
    if (data.byStage && typeof data.byStage === "object") setByStage(data.byStage);
    if (data.stageTotals && typeof data.stageTotals === "object") setStageTotals(data.stageTotals);
    if (typeof data.totalTickets === "number") setTotalTickets(data.totalTickets);
  }, []);

  // Authoritative refresh: badge = server-computed unread for this admin.
  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(
        `/api/admin/support-tickets/count?uid=${encodeURIComponent(uid)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      applyState(data);
    } catch {
      // Keep last known values; the next event/poll/focus retries.
    }
  }, [uid, applyState]);

  // Initial load + safety-net polling (SSE is the primary live feed;
  // polling + focus-refresh cover dropped streams).
  useEffect(() => {
    if (!uid || !canView) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid, canView, refresh]);

  useSSE({
    uid: canView ? uid : null,
    channels: ["admin:tickets"],
    onEvent: (type, data) => {
      if (type !== "ticket.created" && type !== "ticket.updated") return;
      // Reconcile with the server instead of trusting the payload:
      // the payload count is global, but the badge is per-admin.
      // The ticket id IS trusted for thread refresh (which refetches
      // the authoritative history via GET ?id=, never using the payload).
      refresh();
      const tid = data?.ticket?._id ? String(data.ticket._id) : null;
      if (tid) setLastTicketId(tid);
      setLastEventSeq((s) => s + 1);
    },
  });

  // Mark every currently-unresolved ticket as seen by this admin.
  // Clears the badge instantly, then reconciles with the server response.
  const markAllRead = useCallback(async () => {
    if (!uid) return;
    setUnread(0);
    setItems([]);
    try {
      const res = await fetch("/api/admin/support-tickets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, all: true }),
      });
      applyState(await res.json());
    } catch {
      refresh();
    }
  }, [uid, applyState, refresh]);

  // Mark one ticket as seen by this admin (opening it from the bell or
  // the list). Other admins are unaffected. The item disappears instantly;
  // the count itself always comes from the server response (never decremented
  // locally, so double-invokes or concurrent events cannot drift it).
  const markRead = useCallback(async (ticketDbId) => {
    if (!uid || !ticketDbId) return;
    const id = String(ticketDbId);
    setItems((prev) => prev.filter((n) => String(n._id) !== id));
    try {
      const res = await fetch("/api/admin/support-tickets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, ticketIds: [id] }),
      });
      applyState(await res.json());
    } catch {
      refresh();
    }
  }, [uid, applyState, refresh]);

  return (
    <TicketAlertContext.Provider
      value={{ canView, unread, items, pendingOpen, byStage, totalUnread: unread, stageTotals, totalTickets, lastEventSeq, lastTicketId, markAllRead, markRead, refresh }}
    >
      {children}
    </TicketAlertContext.Provider>
  );
}
