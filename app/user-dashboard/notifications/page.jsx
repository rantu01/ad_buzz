"use client";

import { useRouter } from "next/navigation";
import { useUserAlerts } from "../components/UserAlertProvider";
import NotificationHistory from "@/app/Component/Notifications/NotificationHistory";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

const PAGE_LIMIT = 20;

export default function CustomerNotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { markRead, markAllRead, refresh, notifSeq } = useUserAlerts();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");

  const load = async (targetPage = page, targetFilter = filter) => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        uid: user.uid,
        page: String(targetPage),
        limit: String(PAGE_LIMIT),
      });
      if (targetFilter === "unread") params.set("unreadOnly", "1");
      const res = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setItems(data.notifications || []);
        setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
        setTotal(typeof data.total === "number" ? data.total : 0);
        setUnreadCount(typeof data.unread === "number" ? data.unread : 0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (user?.uid) load(1, filter);
    else if (!authLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading]);

  // A new arrival refreshes the current view (stays on unread rows when
  // that filter is active).
  useEffect(() => {
    if (notifSeq > 0) load(page, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifSeq]);

  const handleFilterChange = (f) => {
    setFilter(f);
    setPage(1);
    load(1, f);
  };

  const handlePageChange = (p) => {
    const next = Math.min(Math.max(1, p), Math.max(1, totalPages));
    setPage(next);
    load(next, filter);
  };

  const handleSelect = async (n) => {
    await markRead(String(n._id), n.refType === "ticket" && n.refId ? { ticketDbId: String(n.refId) } : undefined);
    setItems((prev) => prev.map((x) => (String(x._id) === String(n._id) ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - (n.read ? 0 : 1)));
    if (n.refType === "ticket" && n.refId) {
      try { window.sessionStorage.setItem("ab_highlight_ticket", String(n.refId)); } catch {}
      router.push("/user-dashboard/support-tickets");
    } else if (n.link) {
      router.push(n.link);
    } else {
      refresh();
      load(page, filter);
    }
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    load(page, filter);
  };

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Notifications</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Notification History</h1>
        <p className="text-sm text-slate-600 mt-1">Ticket replies, stage changes and deposit updates.</p>
      </div>
      <NotificationHistory
        items={items}
        loading={loading}
        onSelect={handleSelect}
        onMarkAllRead={handleMarkAll}
        serverPaging={{ page, totalPages, total, unreadCount, filter, onFilterChange: handleFilterChange, onPageChange: handlePageChange }}
      />
    </div>
  );
}
