"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { BellRing, CalendarDays, CheckCheck, Eye, Inbox, Loader2, Megaphone } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import { formatNoticeDate } from "@/lib/noticeConstants";
import { useNotices } from "@/app/Component/Notices/NoticeProvider";
import { StructuredChanges } from "@/app/Component/Notices/NoticeContent";
import Pagination from "@/app/Component/Pagination";

const LIMIT = 10;
const FILTERS = [
  { key: "all", label: "All notices" },
  { key: "unread", label: "Unread" },
  { key: "important", label: "Important" },
];

function stripHtml(html = "") {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={18} />
      </span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export default function CustomerNoticesPage() {
  const { user } = useAuth();
  const { counts, refresh: refreshProvider, openNoticeById } = useNotices();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState("");
  const openingRef = useRef(false);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filter === "unread") params.set("unreadOnly", "1");
      if (filter === "important") params.set("importantOnly", "1");
      const res = await authFetch(`/api/notices?${params.toString()}`, {}, user);
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setItems(data.notices || []);
        setMeta({ total: data.total || 0, totalPages: data.totalPages || 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [user, page, filter]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const handleOpen = async (id) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpeningId(id);
    try {
      const opened = await openNoticeById(id);
      if (!opened) {
        Swal.fire({
          toast: true, position: "top-end", icon: "error",
          title: "Could not open this notice. Please try again.",
          timer: 3000, showConfirmButton: false,
        });
      }
      await Promise.all([load(), refreshProvider()]);
    } finally {
      openingRef.current = false;
      setOpeningId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-[#C2410C]">
              <Megaphone size={20} />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Notices &amp; Announcements</h1>
              <p className="text-sm text-slate-500">Official updates from Ads Buzz</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={BellRing} label="Total notices" value={counts.total} tone="bg-slate-100 text-slate-600" />
        <SummaryCard icon={Inbox} label="Unread" value={counts.unread} tone="bg-amber-100 text-amber-700" />
        <SummaryCard icon={CheckCheck} label="Awaiting acknowledgement" value={counts.pendingAck} tone="bg-orange-100 text-[#C2410C]" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => { setFilter(item.key); setPage(1); }}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              filter === item.key
                ? "border-[#F48E2B] text-[#C2410C]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{meta.total} notice(s)</span>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
              <div className="h-4 w-1/3 rounded bg-slate-100" />
              <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <BellRing size={22} />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-slate-700">No notices here</h3>
          <p className="mt-1 text-xs text-slate-500">Notices addressed to you will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((notice) => {
            const read = Boolean(notice.recipient?.readAt);
            const acknowledged = Boolean(notice.recipient?.acknowledgedAt);
            return (
              <article
                key={notice._id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow ${
                  read ? "border-slate-200" : "border-amber-300 ring-1 ring-amber-200/60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {notice.type}
                      </span>
                      {notice.isImportant ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                          Important
                        </span>
                      ) : null}
                      {!read ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          New
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-2 break-words text-sm font-bold text-slate-900 sm:text-base">{notice.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>Published {formatNoticeDate(notice.publishedAt)}</span>
                      {notice.effectiveAt ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} /> Effective {formatNoticeDate(notice.effectiveAt, true)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {acknowledged ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCheck size={12} /> Acknowledged
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600">{stripHtml(notice.message)}</p>

                {notice.structuredChanges?.length > 0 ? (
                  <div className="mt-3">
                    <StructuredChanges notice={notice} compact />
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="text-[11px] text-slate-400">{notice.company || "Ads Buzz"}</p>
                  <button
                    type="button"
                    disabled={openingId === notice._id}
                    onClick={() => handleOpen(notice._id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#F48E2B] hover:text-[#C2410C] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {openingId === notice._id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Eye size={14} />}
                    {openingId === notice._id ? "Opening…" : "Read notice"}
                  </button>
                </div>
              </article>
            );
          })}
          <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
