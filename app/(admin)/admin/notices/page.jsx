"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  Archive,
  BellRing,
  Clock,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import Pagination from "@/app/Component/Pagination";
import useSSE from "@/app/Component/Hooks/useSSE";
import NoticeContent from "@/app/Component/Notices/NoticeContent";
import { NOTICE_TYPES, formatNoticeDate } from "@/lib/noticeConstants";

const LIMIT = 10;

function StatusPill({ status }) {
  const styles = {
    draft: "bg-slate-100 text-slate-600",
    scheduled: "bg-amber-100 text-amber-700",
    published: "bg-emerald-100 text-emerald-700",
    archived: "bg-slate-200 text-slate-500",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value ?? 0}</p>
      </div>
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function AdminNoticesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [counts, setCounts] = useState({ draft: 0, scheduled: 0, published: 0, archived: 0 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [audienceType, setAudienceType] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [recipients, setRecipients] = useState(null);
  // One key per notice+action, so a pending action never blocks unrelated rows.
  const [busyAction, setBusyAction] = useState("");
  const busyKey = (notice, action) => `${notice?._id || ""}:${action}`;
  const isBusy = (notice, action) => busyAction === busyKey(notice, action);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "all") params.set("status", status);
      if (type !== "all") params.set("type", type);
      if (audienceType === "individual") params.set("audienceType", "individual");
      if (audienceType === "all_customers") params.set("audienceType", "all");
      const res = await authFetch(`/api/admin/notices?${params.toString()}`, {}, user);
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setItems(data.notices || []);
        setStats(data.stats || {});
        setCounts(data.counts || {});
        setMeta({ total: data.total || 0, totalPages: data.totalPages || 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [user, page, debouncedSearch, status, type, audienceType]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useSSE({
    uid: user?.uid,
    channels: ["admin:notices"],
    onEvent: (event) => { if (String(event).startsWith("notice.")) load(); },
    onReconnect: load,
  });

  const toast = (title, icon = "success") =>
    Swal.fire({ toast: true, position: "top-end", icon, title, timer: 2500, showConfirmButton: false });

  const runAction = async (notice, action, options = {}) => {
    const isDelete = action === "delete";
    const res = await authFetch(`/api/admin/notices/${notice._id}`, {
      method: isDelete ? "DELETE" : "PATCH",
      ...(isDelete ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notice._id, action, ...options }),
      }),
    }, user);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || "Action failed");
    await load();
    return data.message || "Notice updated";
  };

  // SweetAlert2 owns the confirmation button's loading state; the row's own
  // icon button also shows a spinner via busyAction.
  const confirmAndRun = async (notice, action, swalOptions) => {
    const key = busyKey(notice, action);
    setBusyAction(key);
    try {
      const result = await Swal.fire({
        ...swalOptions,
        showCancelButton: true,
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        preConfirm: async (inputValue) => {
          try {
            return await runAction(notice, action, action === "schedule" ? { scheduledAt: inputValue } : {});
          } catch (error) {
            Swal.showValidationMessage(error.message || "Action failed");
            return false;
          }
        },
      });
      if (result.isConfirmed && typeof result.value === "string") toast(result.value);
    } finally {
      setBusyAction("");
    }
  };

  const handleAction = async (notice, action) => {
    if (action === "publish") {
      await confirmAndRun(notice, action, {
        title: "Publish this notice?",
        text: `"${notice.title}" will become visible to its audience immediately.`,
        icon: "question",
        confirmButtonColor: "#EA580C",
        confirmButtonText: "Publish",
      });
    } else if (action === "schedule") {
      await confirmAndRun(notice, action, {
        title: "Schedule notice",
        text: `"${notice.title}" will be published at the time below.`,
        input: "datetime-local",
        inputValue: notice.scheduledAt ? notice.scheduledAt.slice(0, 16) : "",
        inputLabel: "Publish at",
        icon: "question",
        confirmButtonColor: "#EA580C",
        confirmButtonText: "Schedule",
        inputValidator: (value) => (!value ? "Choose a date and time." : null),
      });
    } else if (action === "archive") {
      await confirmAndRun(notice, action, {
        title: "Archive this notice?",
        text: `"${notice.title}" will no longer be visible to customers. Its history and acknowledgement records are preserved.`,
        icon: "warning",
        confirmButtonColor: "#dc2626",
        confirmButtonText: "Archive",
      });
    } else if (action === "delete") {
      const preserved = notice.status === "published" || notice.status === "archived";
      await confirmAndRun(notice, action, {
        title: "Delete this notice?",
        text: `"${notice.title}" will be removed from the admin list. ${
          preserved
            ? "Customer read and acknowledgement history stays stored in MongoDB."
            : "This cannot be undone."
        }`,
        icon: "warning",
        confirmButtonColor: "#dc2626",
        confirmButtonText: "Delete",
      });
    }
  };

  const openDetail = async (notice) => {
    const key = busyKey(notice, "detail");
    setBusyAction(key);
    try {
      const res = await authFetch(`/api/admin/notices?id=${notice._id}&history=1`, {}, user);
      const data = await res.json().catch(() => ({}));
      if (data.success) setDetail(data);
      else Swal.fire("Error", data.message || "Failed to load notice", "error");
    } catch {
      Swal.fire("Error", "Failed to load notice", "error");
    } finally {
      setBusyAction("");
    }
  };

  const openRecipients = async (notice, pageNumber = 1) => {
    const key = busyKey(notice, "recipients");
    setBusyAction(key);
    try {
      const res = await authFetch(`/api/admin/notices/${notice._id}/recipients?page=${pageNumber}&limit=20`, {}, user);
      const data = await res.json().catch(() => ({}));
      if (data.success) setRecipients(data);
      else Swal.fire("Error", data.message || "Failed to load recipients", "error");
    } catch {
      Swal.fire("Error", "Failed to load recipients", "error");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-[#C2410C]"><Megaphone size={21} /></span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Notice Management</h1>
            <p className="text-sm text-slate-500">Create, publish and track official Ads Buzz announcements</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/notices/new")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#D97706]"
        >
          <Plus size={16} /> New Notice
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Drafts" value={counts.draft} icon={FileText} tone="bg-slate-100 text-slate-600" />
        <StatCard label="Scheduled" value={counts.scheduled} icon={Clock} tone="bg-amber-100 text-amber-700" />
        <StatCard label="Published" value={counts.published} icon={BellRing} tone="bg-emerald-100 text-emerald-700" />
        <StatCard label="Archived" value={counts.archived} icon={Archive} tone="bg-slate-200 text-slate-600" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notices…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="all">All types</option>
            {NOTICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={audienceType} onChange={(e) => { setAudienceType(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="all">All audiences</option>
            <option value="individual">Individual customers</option>
            <option value="all_customers">All customers</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Megaphone size={22} /></span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No notices found</p>
            <p className="mt-1 text-xs text-slate-500">Try adjusting your filters or create a new notice.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Audience</th>
                  <th className="px-4 py-3 text-left">Published</th>
                  <th className="px-4 py-3 text-left">Effective</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Recipients</th>
                  <th className="px-4 py-3 text-right">Read</th>
                  <th className="px-4 py-3 text-right">Unread</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((notice) => {
                  const raw = stats[notice._id] || {};
                  // Defensive: a malformed stat must never be rendered as an
                  // object child (React throws "Objects are not valid as a
                  // React child") and take down the whole admin page.
                  const s = {
                    total: Number(raw.total) || 0,
                    read: Number(raw.read) || 0,
                    unread: Number(raw.unread) || 0,
                    acknowledged: Number(raw.acknowledged) || 0,
                  };
                  return (
                    <tr key={notice._id} className="hover:bg-slate-50">
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate font-semibold text-slate-800" title={notice.title}>{notice.title}</p>
                        <p className="text-[10px] text-slate-400">Priority: {notice.priority}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{notice.type}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {notice.audienceType === "all" ? "All customers" : `${notice.audienceCount || notice.targetCustomerIds?.length || 0} customer(s)`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatNoticeDate(notice.publishedAt) || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatNoticeDate(notice.effectiveAt) || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatNoticeDate(notice.expiresAt) || "—"}</td>
                      <td className="px-4 py-3"><StatusPill status={notice.status} /></td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{s.total}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-600">{s.read}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-amber-600">{s.unread}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" disabled={isBusy(notice, "detail")} onClick={() => openDetail(notice)} title="View details" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                            {isBusy(notice, "detail") ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Eye size={15} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(["published", "archived"].includes(notice.status) ? `/admin/notices/new?revisionOf=${notice._id}` : `/admin/notices/${notice._id}`)}
                            title={["published", "archived"].includes(notice.status) ? "Create revision" : "Edit notice"}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                          ><Pencil size={15} /></button>
                          <button type="button" disabled={isBusy(notice, "recipients")} onClick={() => openRecipients(notice)} title="View recipients & statistics" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                            {isBusy(notice, "recipients") ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Users size={15} />}
                          </button>
                          {notice.status === "draft" ? (
                            <button type="button" disabled={isBusy(notice, "publish")} onClick={() => handleAction(notice, "publish")} title="Publish" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
                              {isBusy(notice, "publish") ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} />}
                            </button>
                          ) : null}
                          {notice.status === "draft" || notice.status === "scheduled" ? (
                            <button type="button" disabled={isBusy(notice, "schedule")} onClick={() => handleAction(notice, "schedule")} title="Schedule" className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 disabled:opacity-50">
                              {isBusy(notice, "schedule") ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Clock size={15} />}
                            </button>
                          ) : null}
                          {notice.status === "published" || notice.status === "scheduled" ? (
                            <button type="button" disabled={isBusy(notice, "archive")} onClick={() => handleAction(notice, "archive")} title="Unpublish / Archive" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                              {isBusy(notice, "archive") ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Archive size={15} />}
                            </button>
                          ) : null}
                          <button type="button" disabled={isBusy(notice, "delete")} onClick={() => handleAction(notice, "delete")} title={notice.status === "published" || notice.status === "archived" ? "Delete notice (history preserved)" : "Delete notice"} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50">
                            {isBusy(notice, "delete") ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />

      {detail ? (
        <ModalShell
          title={detail.notice.title}
          subtitle={`${detail.notice.type} · ${detail.notice.audienceType === "all" ? "All customers" : `${detail.notice.audienceCount || 0} customer(s)`} · ${detail.notice.status}`}
          onClose={() => setDetail(null)}
        >
          <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-center">
            <div><p className="text-xs font-bold text-slate-900">{detail.stats?.total ?? 0}</p><p className="text-[10px] text-slate-500">Recipients</p></div>
            <div><p className="text-xs font-bold text-emerald-600">{detail.stats?.read ?? 0}</p><p className="text-[10px] text-slate-500">Read</p></div>
            <div><p className="text-xs font-bold text-[#C2410C]">{detail.stats?.acknowledged ?? 0}</p><p className="text-[10px] text-slate-500">Acknowledged</p></div>
          </div>
          <NoticeContent notice={detail.notice} />
          {detail.notice.history?.length ? (
            <div className="border-t border-slate-100 px-5 py-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">History</h3>
              <div className="space-y-1">
                {detail.notice.history.slice().reverse().map((entry, i) => (
                  <p key={i} className="text-[11px] text-slate-600">
                    <span className="font-semibold">{entry.action}</span> · {formatNoticeDate(entry.at, true)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </ModalShell>
      ) : null}

      {recipients ? (
        <ModalShell
          title="Recipients & Statistics"
          subtitle={recipients.notice?.title}
          onClose={() => setRecipients(null)}
          wide
        >
          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 sm:grid-cols-4">
            <div><p className="text-sm font-bold text-slate-900">{recipients.stats?.total ?? 0}</p><p className="text-[10px] text-slate-500">Total recipients</p></div>
            <div><p className="text-sm font-bold text-emerald-600">{recipients.stats?.read ?? 0}</p><p className="text-[10px] text-slate-500">Read</p></div>
            <div><p className="text-sm font-bold text-amber-600">{recipients.stats?.unread ?? 0}</p><p className="text-[10px] text-slate-500">Unread</p></div>
            <div><p className="text-sm font-bold text-[#C2410C]">{recipients.stats?.acknowledged ?? 0}</p><p className="text-[10px] text-slate-500">Acknowledged</p></div>
          </div>
          {isBusy(recipients.notice, "recipients") ? (
            <div className="flex items-center gap-2 px-5 py-2 text-[11px] text-slate-500" role="status">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Loading recipients…
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Customer ID</th>
                  <th className="px-4 py-2 text-left">Read</th>
                  <th className="px-4 py-2 text-left">Acknowledged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(recipients.recipients || []).map((r) => (
                  <tr key={r.uid}>
                    <td className="px-4 py-2">
                      <p className="font-semibold text-slate-800">{r.displayName || r.email || "Customer"}</p>
                      <p className="text-[10px] text-slate-500">{r.email}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.customId || "—"}</td>
                    <td className="px-4 py-2">{r.readAt ? <span className="font-semibold text-emerald-600">{formatNoticeDate(r.readAt, true)}</span> : <span className="text-slate-400">Unread</span>}</td>
                    <td className="px-4 py-2">{r.acknowledgedAt ? <span className="font-semibold text-[#C2410C]">{formatNoticeDate(r.acknowledgedAt, true)}</span> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`px-5 pb-5 ${isBusy(recipients.notice, "recipients") ? "pointer-events-none opacity-50" : ""}`}>
            <Pagination page={recipients.page} totalPages={recipients.totalPages} onPageChange={(p) => openRecipients(recipients.notice, p)} />
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
