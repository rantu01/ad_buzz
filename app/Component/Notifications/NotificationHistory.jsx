"use client";

import { useState } from "react";
import { Bell, LifeBuoy, Banknote, CheckCheck } from "lucide-react";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 20;

function iconFor(type) {
  if (type?.startsWith("deposit")) return { Icon: Banknote, cls: "bg-emerald-100 text-emerald-700" };
  if (type?.startsWith("ticket")) return { Icon: LifeBuoy, cls: "bg-amber-100 text-amber-700" };
  return { Icon: Bell, cls: "bg-slate-100 text-slate-600" };
}

// Shared notification-history list (read/unread log) used by both the
// admin and customer notification pages — same experience both sides.
//
// Two modes:
// - Client mode (default): paginates `items` locally (20/page).
// - Server mode: pass `serverPaging` ({ page, totalPages, total,
//   unreadCount, filter, onFilterChange, onPageChange }) and the parent
//   fetches each page from the API (no row cap).
export default function NotificationHistory({
  items = [],
  loading = false,
  onSelect,
  onMarkAllRead,
  actionLabel = "View",
  serverPaging = null,
}) {
  const [clientFilter, setClientFilter] = useState("all");
  const [clientPage, setClientPage] = useState(1);

  const isServer = Boolean(serverPaging);
  const filter = isServer ? serverPaging.filter : clientFilter;
  const setFilter = (f) => {
    if (isServer) serverPaging.onFilterChange(f);
    else { setClientFilter(f); setClientPage(1); }
  };
  const setPage = (p) => {
    if (isServer) serverPaging.onPageChange(p);
    else setClientPage(p);
  };

  const visible = isServer ? items : (filter === "unread" ? items.filter((n) => !n.read) : items);
  const totalPages = isServer
    ? Math.max(1, serverPaging.totalPages || 1)
    : Math.max(1, Math.ceil(visible.length / ITEMS_PER_PAGE));
  const page = isServer ? serverPaging.page : clientPage;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paged = isServer ? items : visible.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const unreadCount = isServer ? (serverPaging.unreadCount || 0) : items.filter((n) => !n.read).length;
  const totalCount = isServer ? (serverPaging.total || 0) : items.length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-48 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-full bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["all", "unread"].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); if (!isServer) setPage(1); }}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${
              filter === f
                ? "bg-[#F59E0B] text-slate-950"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "unread" ? `Unread (${unreadCount})` : `All (${totalCount})`}
          </button>
        ))}
        {unreadCount > 0 && onMarkAllRead && (
          <button
            onClick={onMarkAllRead}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {paged.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-sm text-center">
          <p className="text-lg font-semibold text-slate-700">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === "unread" ? "You're all caught up." : "Ticket replies and deposit updates will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paged.map((n) => {
            const { Icon, cls } = iconFor(n.type);
            const isUnread = !n.read;
            return (
              <div
                key={String(n._id)}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition-colors ${
                  isUnread ? "border-amber-300 ring-1 ring-amber-300/50 bg-amber-50/40" : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cls}`}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm ${isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                        {n.title}
                      </p>
                      {isUnread ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" /> Unread
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Read
                        </span>
                      )}
                    </div>
                    {n.body && <p className="mt-1 text-sm text-slate-600">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                    </p>
                  </div>
                  {onSelect && (n.link || n.refId) && (
                    <button
                      onClick={() => onSelect(n)}
                      className="shrink-0 rounded-xl bg-[#F59E0B] px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-[#D9910A] transition"
                    >
                      {actionLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
