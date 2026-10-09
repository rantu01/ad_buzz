"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "../components/AdminProvider";
import { useNotifications } from "../components/NotificationProvider";
import NotificationHistory from "@/app/Component/Notifications/NotificationHistory";

const PAGE_LIMIT = 20;

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { profile } = useAdmin();
  const uid = profile?.uid || null;
  const { markRead, markAllRead, refresh, lastEventSeq } = useNotifications();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");

  const load = async (targetPage = page, targetFilter = filter) => {
    if (!uid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        uid,
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
    if (uid) load(1, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // A new arrival refreshes the current view.
  useEffect(() => {
    if (lastEventSeq > 0) load(page, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventSeq]);

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
      try { window.sessionStorage.setItem("ab_open_ticket", String(n.refId)); } catch {}
      router.push("/admin/support-tickets");
    } else if (n.refType === "deposit" && n.refId) {
      try { window.sessionStorage.setItem("ab_open_deposit", String(n.refId)); } catch {}
      router.push("/admin/deposits");
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

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Notifications</h1>
      <p className="text-sm text-slate-500 mb-6">Ticket replies, stage changes and deposit updates</p>
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
