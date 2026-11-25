"use client";

/* eslint-disable react-hooks/set-state-in-effect */
// Data-loading effects follow the same pattern as the existing dashboard
// pages: loading flags are set synchronously, then resolved asynchronously.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
import { useNotifications } from "../components/NotificationProvider";
import { authJson } from "@/lib/authFetch";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { REQUEST_STATUSES, STATUS_LABELS, STATUS_STYLES, statusLabel } from "@/lib/adAccountRequestConstants";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import Pagination from "@/app/Component/Pagination";
import Swal from "sweetalert2";
import { ClipboardList, Search, Eye, X, Loader2, AlertCircle, ExternalLink, RefreshCw, CheckCircle2, XCircle, MessageSquare, SlidersHorizontal } from "lucide-react";

const EMPTY_FILTERS = { customer: "", accountName: "", platform: "", status: "", dateFrom: "", dateTo: "" };
const ITEMS_PER_PAGE = 10;

function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {statusLabel(status)}
    </span>
  );
}

const inputBase = "min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 hover:border-slate-300";

export default function AdminAdAccountRequestsPage() {
  const { user } = useAuth();
  const { profile, access } = useAdmin();
  const { lastEventSeq } = useNotifications();
  const role = profile?.role || "customer";
  const canManage =
    role === "admin" ||
    role === "director" ||
    hasPermission(role, PERMISSIONS.MANAGE_AD_ACCOUNT_REQUESTS, access?.permissions);

  const [requests, setRequests] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusChoice, setStatusChoice] = useState("pending");
  const [busyAction, setBusyAction] = useState("");
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const detailVersionRef = useRef(0);

  // SweetAlert2 must be mounted inside the open native dialog, otherwise the
  // browser marks it inert and its buttons cannot be clicked.
  const swalTarget = () => (dialogRef.current?.open ? { target: dialogRef.current } : {});

  const loadPlatforms = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const { ok, data } = await authJson("/api/ad-account-requests/platforms", {}, user);
      if (ok && data.success) setPlatforms(data.platforms || []);
    } catch { /* platform filter simply stays empty */ }
  }, [user]);

  const loadRequests = useCallback(async (targetPage = page) => {
    if (!user?.uid) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      params.set("page", String(targetPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      const { ok, data } = await authJson(`/api/admin/ad-account-requests?${params}`, {}, user);
      if (!ok || !data.success) throw new Error(data.message || "Unable to load requests.");
      setRequests(data.requests || []);
      setStats(data.stats || null);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.message || "Unable to load requests.");
    } finally {
      setLoading(false);
    }
  }, [user, page, filters]);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);

  // Debounce typing, but apply filter-select changes immediately.
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => loadRequests(1), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.customer, filters.accountName, filters.platform, filters.status, filters.dateFrom, filters.dateTo, reloadKey, user?.uid]);

  useEffect(() => {
    if (lastEventSeq > 0) loadRequests(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventSeq]);

  useEffect(() => {
    if (!user?.uid) return;
    let id = null;
    try { id = window.sessionStorage.getItem("ab_open_admin_ad_request"); } catch { /* ignore */ }
    if (!id) return;
    try { window.sessionStorage.removeItem("ab_open_admin_ad_request"); } catch { /* ignore */ }
    (async () => {
      const { ok, data } = await authJson(`/api/admin/ad-account-requests?id=${encodeURIComponent(id)}`, {}, user);
      if (ok && data.success && data.request) openDetails(data.request, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!selected || !dialogRef.current) return;
    if (!dialogRef.current.open) dialogRef.current.showModal();
    titleRef.current?.focus();
  }, [selected]);

  function openDetails(request, fetchFull = true) {
    detailVersionRef.current += 1;
    const version = detailVersionRef.current;
    setSelected(request);
    setStatusChoice(request.status || "pending");
    if (!fetchFull) return;
    setDetailLoading(true);
    authJson(`/api/admin/ad-account-requests?id=${encodeURIComponent(request._id)}`, {}, user)
      .then(({ ok, data }) => {
        // Ignore a slow background fetch after the admin has already acted
        // on this request, so stale data can never overwrite the new state.
        if (version !== detailVersionRef.current) return;
        if (ok && data.success && data.request) {
          setSelected(data.request);
          setStatusChoice(data.request.status || "pending");
        }
      })
      .catch(() => { /* keep the row already on screen */ })
      .finally(() => setDetailLoading(false));
  }

  const closeDetails = () => {
    dialogRef.current?.close();
    setSelected(null);
  };

  const applyAction = async (payload, confirmText) => {
    if (!selected || busyAction) return null;
    setBusyAction(payload.action);
    try {
      const { ok, data } = await authJson("/api/admin/ad-account-requests", {
        method: "PATCH",
        body: JSON.stringify({ id: selected._id, ...payload }),
      }, user);
      if (!ok || !data.success) throw new Error(data.message || "Unable to update the request.");
      detailVersionRef.current += 1;
      setSelected(data.request);
      setStatusChoice(data.request.status || "pending");
      setReloadKey((k) => k + 1);
      Swal.fire({ ...swalTarget(), icon: "success", title: confirmText || data.message || "Request updated", timer: 1600, showConfirmButton: false });
      return data.request;
    } catch (err) {
      Swal.fire({ ...swalTarget(), icon: "error", title: "Update failed", text: err.message || "Please try again.", confirmButtonColor: "#F59E0B" });
      return null;
    } finally {
      setBusyAction("");
    }
  };

  const handleApprove = async () => {
    const result = await Swal.fire({ ...swalTarget(),
      title: `Approve "${selected?.adAccountName}"?`,
      text: "The customer will be notified and the request will be marked approved.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Approve request",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#059669",
      reverseButtons: true,
    });
    if (result.isConfirmed) await applyAction({ action: "approve" }, "Request approved");
  };

  const handleReject = async () => {
    const result = await Swal.fire({ ...swalTarget(),
      title: `Reject "${selected?.adAccountName}"?`,
      text: "The reason you enter will be shown to the customer.",
      input: "textarea",
      inputPlaceholder: "Explain why this request was rejected…",
      inputAttributes: { "aria-label": "Rejection reason" },
      showCancelButton: true,
      confirmButtonText: "Reject request",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#e11d48",
      focusCancel: true,
      preConfirm: (value) => {
        if (!value || !String(value).trim()) {
          Swal.showValidationMessage("A rejection reason is required.");
          return false;
        }
        return String(value).trim();
      },
    });
    if (result.isConfirmed) await applyAction({ action: "reject", reason: result.value }, "Request rejected");
  };

  const handleMoreInfo = async () => {
    const result = await Swal.fire({ ...swalTarget(),
      title: "Request more information",
      text: "Tell the customer exactly what you need. Your message will appear in their request details.",
      input: "textarea",
      inputPlaceholder: "What additional information is needed?",
      inputAttributes: { "aria-label": "Information needed" },
      showCancelButton: true,
      confirmButtonText: "Send request",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#F59E0B",
      preConfirm: (value) => {
        if (!value || !String(value).trim()) {
          Swal.showValidationMessage("Describe what additional information is needed.");
          return false;
        }
        return String(value).trim();
      },
    });
    if (result.isConfirmed) await applyAction({ action: "more_info", note: result.value }, "Information request sent");
  };

  const handleStatusChange = async () => {
    if (!selected || statusChoice === selected.status) return;
    let payload = { action: "status", status: statusChoice };
    if (statusChoice === "rejected") {
      const result = await Swal.fire({ ...swalTarget(),
        title: "Move to Rejected?",
        text: "A rejection reason is required and will be visible to the customer.",
        input: "textarea",
        inputPlaceholder: "Reason for rejection…",
        inputAttributes: { "aria-label": "Rejection reason" },
        showCancelButton: true,
        confirmButtonText: "Reject request",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#e11d48",
        focusCancel: true,
        preConfirm: (value) => {
          if (!value || !String(value).trim()) {
            Swal.showValidationMessage("A rejection reason is required.");
            return false;
          }
          return String(value).trim();
        },
      });
      if (!result.isConfirmed) return;
      payload = { ...payload, reason: result.value };
    }
    if (statusChoice === "more_info_required") {
      const result = await Swal.fire({ ...swalTarget(),
        title: "Move to More Information Required?",
        text: "Your message will be shown to the customer.",
        input: "textarea",
        inputPlaceholder: "What additional information is needed?",
        inputAttributes: { "aria-label": "Information needed" },
        showCancelButton: true,
        confirmButtonText: "Send request",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#F59E0B",
        preConfirm: (value) => {
          if (!value || !String(value).trim()) {
            Swal.showValidationMessage("Describe what additional information is needed.");
            return false;
          }
          return String(value).trim();
        },
      });
      if (!result.isConfirmed) return;
      payload = { ...payload, note: result.value };
    }
    await applyAction(payload, "Status updated");
  };

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const cards = [
    { label: "Total Requests", count: stats?.total ?? 0, tone: "text-slate-900" },
    { label: "Pending Requests", count: stats?.pending ?? 0, tone: "text-amber-600" },
    { label: "Under Review", count: stats?.under_review ?? 0, tone: "text-blue-600" },
    { label: "Approved", count: stats?.approved ?? 0, tone: "text-emerald-600" },
    { label: "Rejected", count: stats?.rejected ?? 0, tone: "text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Ad Account Request</h1>
          <p className="text-sm text-slate-500">Review customer requests and manage their status</p>
        </div>
        <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); setReloadKey((k) => k + 1); }} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-amber-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <section aria-label="Filter requests" className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <SlidersHorizontal size={14} aria-hidden="true" /> Filters
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="aar-admin-customer" className="mb-1.5 block text-xs font-medium text-slate-600">Customer name or email</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id="aar-admin-customer" type="search" value={filters.customer} onChange={(e) => setFilter("customer", e.target.value)} placeholder="Search customer…" className={`${inputBase} pl-9`} />
            </div>
          </div>
          <div>
            <label htmlFor="aar-admin-account" className="mb-1.5 block text-xs font-medium text-slate-600">Ad Account Name</label>
            <input id="aar-admin-account" type="search" value={filters.accountName} onChange={(e) => setFilter("accountName", e.target.value)} placeholder="Search ad account…" className={inputBase} />
          </div>
          <div>
            <label htmlFor="aar-admin-platform" className="mb-1.5 block text-xs font-medium text-slate-600">Platform</label>
            <select id="aar-admin-platform" value={filters.platform} onChange={(e) => setFilter("platform", e.target.value)} className={inputBase}>
              <option value="">All platforms</option>
              {platforms.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aar-admin-status" className="mb-1.5 block text-xs font-medium text-slate-600">Status</label>
            <select id="aar-admin-status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={inputBase}>
              <option value="">All statuses</option>
              {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aar-admin-from" className="mb-1.5 block text-xs font-medium text-slate-600">Request date from</label>
            <input id="aar-admin-from" type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} className={inputBase} />
          </div>
          <div>
            <label htmlFor="aar-admin-to" className="mb-1.5 block text-xs font-medium text-slate-600">Request date to</label>
            <input id="aar-admin-to" type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} className={inputBase} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">{total} matching request{total === 1 ? "" : "s"}</p>
          <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); setReloadKey((k) => k + 1); }} className="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Clear filters</button>
        </div>
      </section>

      {/* Table */}
      <section aria-label="Submitted requests" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {error ? (
          <div className="px-5 py-12 text-center" role="alert">
            <AlertCircle className="mx-auto text-rose-500" size={26} aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-800">We couldn&apos;t load the requests.</p>
            <p className="mt-1 text-xs text-slate-500">{error}</p>
            <button type="button" onClick={() => loadRequests(page)} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-amber-400">Try again</button>
          </div>
        ) : loading && requests.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500" role="status"><Loader2 className="animate-spin" size={18} aria-hidden="true" /> Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><ClipboardList size={22} aria-hidden="true" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No requests found</p>
            <p className="mt-1 text-xs text-slate-500">New customer submissions will appear here automatically.</p>
            <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setReloadKey((k) => k + 1); }} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-amber-400">Clear filters</button>
          </div>
        ) : (
          <>
            {loading && <div className="h-0.5 w-full animate-pulse bg-amber-300" aria-hidden="true" />}
            <div className="overflow-x-auto">
              <table className="min-w-[1400px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70">
                  <tr>
                    {["Customer Name", "Customer Email", "Platform", "Ad Account Name", "Monthly Budget", "Product", "Business Manager ID", "Website / Page Link", "Request Date", "Status", "Actions"].map((h) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((request) => (
                    <tr key={String(request._id)} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{request.customerName || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{request.customerEmail || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{request.platform}</td>
                      <td className="px-4 py-3 text-slate-800">{request.adAccountName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">${Number(request.monthlyBudget || 0).toFixed(2)}</td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-slate-700" title={request.product}>{request.product}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{request.businessManagerId}</td>
                      <td className="max-w-[180px] truncate px-4 py-3">
                        <a href={request.websitePageLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                          {String(request.websitePageLink || "").replace(/^https?:\/\//, "")} <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(request.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusPill status={request.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button type="button" onClick={() => openDetails(request)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-amber-400 hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                          <Eye size={14} aria-hidden="true" /> View &amp; Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-5 py-2">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </section>

      {/* Detail + actions dialog */}
      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        onClick={(event) => { if (event.target === dialogRef.current) closeDetails(); }}
        aria-labelledby="aar-admin-detail-title"
        className="w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
      >
        {selected && (
          <div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <div>
                <h2 id="aar-admin-detail-title" ref={titleRef} tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none">{selected.adAccountName}</h2>
                <p className="mt-1 text-xs text-slate-500">Submitted {formatDateTime(selected.createdAt)}</p>
              </div>
              <button type="button" onClick={closeDetails} aria-label="Close request details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>

            <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-5">
              {detailLoading && <div className="flex items-center gap-2 text-xs text-slate-500" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading full details…</div>}

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{selected.customerName || "—"}</p>
                  <p className="text-xs text-slate-500">{selected.customerEmail || "—"}</p>
                  {selected.customerCustomId && <p className="text-xs text-slate-400">ID: {selected.customerCustomId}</p>}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current status</p>
                  <div className="mt-2"><StatusPill status={selected.status} /></div>
                  {selected.reviewedByName && <p className="mt-2 text-xs text-slate-500">Last updated by {selected.reviewedByName} {selected.reviewedAt ? `on ${formatDateTime(selected.reviewedAt)}` : ""}</p>}
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ["Platform", selected.platform],
                  ["Ad Account Name", selected.adAccountName],
                  ["Monthly Budget", `$${Number(selected.monthlyBudget || 0).toFixed(2)}`],
                  ["Product", selected.product],
                  ["Business Manager ID", selected.businessManagerId],
                  ["Request ID", String(selected._id)],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-slate-100 pb-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-slate-800">{value || "—"}</dd>
                  </div>
                ))}
                <div className="border-b border-slate-100 pb-2 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Website / Page Link</dt>
                  <dd className="mt-1 break-all text-sm">
                    <a className="text-amber-700 hover:underline" href={selected.websitePageLink} target="_blank" rel="noopener noreferrer">{selected.websitePageLink}</a>
                  </dd>
                </div>
              </dl>

              {selected.adminNote && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <p className="text-sm font-semibold text-violet-900">Message sent to customer</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-violet-800">{selected.adminNote}</p>
                </div>
              )}

              {selected.rejectionReason && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-rose-900">Rejection reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-rose-800">{selected.rejectionReason}</p>
                </div>
              )}

              {selected.customerNote && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-900">Customer response</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-blue-800">{selected.customerNote}</p>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Complete request history</h3>
                <ol className="space-y-3">
                  {(selected.statusHistory || []).map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {STATUS_LABELS[entry.status] || statusLabel(entry.status)}
                          <span className="ml-2 text-xs font-normal text-slate-400">{entry.byName || "System"}</span>
                        </p>
                        {entry.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-600">{entry.note}</p>}
                        {entry.reason && <p className="mt-0.5 text-xs text-rose-600">Reason: {entry.reason}</p>}
                        <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(entry.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {canManage && (
              <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleApprove} disabled={!!busyAction} aria-busy={busyAction === "approve"} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                    <CheckCircle2 size={16} aria-hidden="true" /> Approve Request
                  </button>
                  <button type="button" onClick={handleReject} disabled={!!busyAction} aria-busy={busyAction === "reject"} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">
                    <XCircle size={16} aria-hidden="true" /> Reject Request
                  </button>
                  <button type="button" onClick={handleMoreInfo} disabled={!!busyAction} aria-busy={busyAction === "more_info"} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                    <MessageSquare size={16} aria-hidden="true" /> Request More Information
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                  <label htmlFor="aar-admin-change-status" className="text-xs font-semibold text-slate-600">Change status</label>
                  <select id="aar-admin-change-status" value={statusChoice} onChange={(e) => setStatusChoice(e.target.value)} disabled={!!busyAction} className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20">
                    {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <button type="button" onClick={handleStatusChange} disabled={!!busyAction || statusChoice === selected.status} aria-busy={busyAction === "status"} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {busyAction === "status" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null} Update Status
                  </button>
                  <button type="button" onClick={closeDetails} className="ml-auto min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300">Close</button>
                </div>
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
