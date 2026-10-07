"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSSE from "@/app/Component/Hooks/useSSE";
import { hasPermission } from "@/lib/permissions";
import { useAdmin } from "./AdminProvider";

// Badge = deposits currently in "pending" status, computed in MongoDB.
// Same anti-drift rules as TicketAlertProvider: the client never
// increments/decrements the number itself — every SSE event, poll, or focus
// reconciles against GET /api/admin/deposits/count, so approve/reject,
// concurrent staff, and refreshes always converge on the DB state.
const DepositAlertContext = createContext({
  canView: false,
  pending: 0,
  items: [],
  lastEventSeq: 0,
  refresh: async () => {},
});

export function useDepositAlerts() {
  return useContext(DepositAlertContext);
}

const POLL_MS = 60000;

export default function DepositAlertProvider({ children }) {
  const { profile, access } = useAdmin();
  const role = profile?.role || "customer";
  const uid = profile?.uid || null;
  const canView =
    hasPermission(role, "view_deposits", access?.permissions) ||
    hasPermission(role, "approve_deposits", access?.permissions) ||
    hasPermission(role, "reject_deposits", access?.permissions);

  const [pending, setPending] = useState(0);
  const [items, setItems] = useState([]);
  const [lastEventSeq, setLastEventSeq] = useState(0);

  const applyState = useCallback((data) => {
    if (!data || data.success === false) return;
    if (typeof data.pending === "number") setPending(data.pending);
    if (Array.isArray(data.items)) setItems(data.items);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deposits/count", { cache: "no-store" });
      const data = await res.json();
      applyState(data);
    } catch {
      // Keep last known values; the next event/poll/focus retries.
    }
  }, [applyState]);

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
    channels: ["admin:deposits"],
    onEvent: (type) => {
      if (type !== "deposit.created" && type !== "deposit.updated") return;
      // Reconcile with the server instead of trusting the payload, so the
      // badge always equals the pending count in the database.
      refresh();
      setLastEventSeq((s) => s + 1);
    },
  });

  return (
    <DepositAlertContext.Provider value={{ canView, pending, items, lastEventSeq, refresh }}>
      {children}
    </DepositAlertContext.Provider>
  );
}
