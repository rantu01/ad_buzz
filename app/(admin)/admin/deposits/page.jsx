"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../components/AdminProvider";
import { useDepositAlerts } from "../components/DepositAlertProvider";
import { hasPermission } from "@/lib/permissions";
import Swal from "sweetalert2";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 20;

export default function AdminDepositsPage() {
  const { profile } = useAdmin();
  const role = profile?.role || "customer";
  const canApprove = hasPermission(role, "approve_deposits");
  const canReject = hasPermission(role, "reject_deposits");

  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [previewImg, setPreviewImg] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [highlightId, setHighlightId] = useState(null);
  const { lastEventSeq } = useDepositAlerts();

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const loadDeposits = async (targetPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // "all" sends no status: every record, latest first.
      if (filter && filter !== "all") params.set("status", filter);
      params.set("page", String(targetPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      const res = await fetch(`/api/admin/deposits?${params}`);
      const data = await res.json();
      if (data.success) {
        const list = data.deposits || [];
        setDeposits(list);
        setTotalPages(
          typeof data.totalPages === "number"
            ? data.totalPages
            : Math.ceil(list.length / ITEMS_PER_PAGE)
        );
        // Deep-link from a deposit notification: show all records (latest
        // first) and highlight the referenced one.
        try {
          const deep = window.sessionStorage.getItem("ab_open_deposit");
          if (deep) {
            window.sessionStorage.removeItem("ab_open_deposit");
            setHighlightId(deep);
            setPage(1);
            if (filter !== "all") setFilter("all");
          }
        } catch { /* highlight is best-effort */ }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); loadDeposits(1); }, [filter]);
  // Live update: a new deposit or an approve/reject made anywhere
  // (user app, another staff member) refreshes the current page.
  useEffect(() => {
    if (lastEventSeq > 0) loadDeposits(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventSeq]);

  const totalPagesSafe = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), totalPagesSafe);
  const paginatedDeposits = deposits;

  const goToPage = (p) => {
    const next = Math.min(Math.max(1, p), totalPagesSafe);
    setPage(next);
    loadDeposits(next);
  };

  const handleApprove = async (depositId) => {
    const confirmed = await Swal.fire({
      icon: "question", title: "Approve Deposit?", text: "User balance will be updated immediately.",
      showCancelButton: true, confirmButtonText: "Yes, approve",
    });
    if (!confirmed.isConfirmed) return;

    setProcessingId(depositId);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositId,
          status: "approved",
          approverUid: profile?.uid || "",
          approverRole: profile?.role,
          approverEmail: profile?.email,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        await Swal.fire({ icon: "error", title: "Failed", text: result.message });
        return;
      }
      await Swal.fire({ icon: "success", title: "Approved", timer: 1200, showConfirmButton: false });
      // The approved row leaves the pending set: reload the current page
      // (cheap 20-row fetch) so counts and rows stay exact.
      loadDeposits(page);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (depositId) => {
    const { value: result } = await Swal.fire({
      icon: "warning",
      title: "Reject Deposit",
      html: `
        <label style="display:block;text-align:left;font-size:13px;font-weight:500;color:#334155;margin-bottom:6px;">Reason for rejection *</label>
        <input id="swal-reject-reason" class="swal2-input" placeholder="Enter reason..." style="margin:0 0 12px;width:100%;" />
        <label style="display:block;text-align:left;font-size:13px;font-weight:500;color:#334155;margin-bottom:6px;">Supporting file (optional)</label>
        <input id="swal-reject-file" type="file" accept="image/*" class="swal2-file" style="margin:0;width:100%;" />
      `,
      showCancelButton: true,
      confirmButtonText: "Reject",
      focusConfirm: false,
      preConfirm: () => {
        const reason = document.getElementById("swal-reject-reason")?.value?.trim();
        if (!reason) {
          Swal.showValidationMessage("Please enter a reason for rejection.");
          return false;
        }
        const fileInput = document.getElementById("swal-reject-file");
        const file = fileInput?.files?.[0];
        if (!file) return { reason, rejectionFile: null };
        if (!file.type.startsWith("image/")) {
          Swal.showValidationMessage("Supporting file must be an image.");
          return false;
        }
        if (file.size > 5 * 1024 * 1024) {
          Swal.showValidationMessage("Supporting file must be under 5MB.");
          return false;
        }
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ reason, rejectionFile: reader.result });
          reader.onerror = () => reject(new Error("Failed to read file."));
          reader.readAsDataURL(file);
        });
      },
    });
    if (!result?.reason) return;
    setProcessingId(depositId);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId, status: "rejected", rejectionReason: result.reason, rejectionFile: result.rejectionFile || null }),
      });
      const rejectData = await res.json();
      if (!res.ok || !rejectData.success) {
        await Swal.fire({ icon: "error", title: "Failed", text: rejectData.message });
        return;
      }
      await Swal.fire({ icon: "success", title: "Rejected", timer: 1200, showConfirmButton: false });
      loadDeposits(page);
    } finally {
      setProcessingId(null);
    }
  };

  const statusBadge = (status) => {
    const colors = {
      pending: "bg-amber-50 text-amber-700",
      approved: "bg-emerald-50 text-emerald-700",
      rejected: "bg-red-50 text-red-700",
    };
    return (
      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[status] || "bg-slate-50 text-slate-600"}`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Deposit Verification</h1>
      <p className="text-sm text-slate-500 mb-6">Review and approve/reject deposit requests</p>

      <div className="mb-6 flex gap-2 flex-wrap">
        {[
          { key: "all", label: "All" },
          { key: "approved", label: "Approved" },
          { key: "pending", label: "Pending" },
          { key: "rejected", label: "Rejected" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setHighlightId(null); }}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${
              filter === key
                ? "bg-[#F59E0B] text-slate-950"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : deposits.length ? (
        <>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">User</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Account</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Amount (BDT)</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Credited (USD)</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Trx Ref</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Reference ID</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">SS</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Reason</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDeposits.map((dep) => (
                  <tr key={dep._id} className={`hover:bg-slate-50/50 transition-colors ${highlightId && String(dep._id) === String(highlightId) ? "bg-amber-50/70 ring-1 ring-inset ring-amber-400/60" : ""}`}>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {new Date(dep.createdAt).toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap text-xs">{dep.email || dep.uid}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{dep.account || "—"}</td>
                    <td className="px-4 py-3 text-slate-800 text-right whitespace-nowrap text-xs">{dep.amountBDT ? `${formatMoney(dep.amountBDT)}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-800 text-right whitespace-nowrap text-xs">${formatMoney(dep.creditedUSD || dep.amount)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">{dep.transactionRef || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">{dep.referenceId || "—"}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {dep.screenshot ? (
                        <button onClick={() => setPreviewImg({ src: dep.screenshot, label: "Payment Screenshot" })} className="inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={dep.screenshot} alt="ss" className="w-10 h-10 rounded-md object-cover border border-slate-200 hover:ring-2 hover:ring-orange-400 transition-shadow" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">{statusBadge(dep.status)}</td>
                    <td className="px-4 py-3 text-slate-500 text-[11px] max-w-[160px]">
                      {dep.status === "rejected" ? (
                        <div className="space-y-1">
                          <p className="break-words">{dep.rejectionReason || "—"}</p>
                          {dep.rejectionFile && (
                            <button
                              onClick={() => setPreviewImg({ src: dep.rejectionFile, label: "Rejection Supporting File" })}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={dep.rejectionFile} alt="rejection file" className="h-5 w-5 rounded object-cover border border-slate-200" />
                              View file
                            </button>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {dep.status === "pending" ? (
                        <div className="flex gap-1.5 justify-center">
                          {canApprove && (
                            <button
                              onClick={() => handleApprove(dep._id)}
                              disabled={processingId === dep._id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white font-medium transition hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {processingId === dep._id ? (
                                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Processing</>
                              ) : "Approve"}
                            </button>
                          )}
                          {canReject && (
                            <button
                              onClick={() => handleReject(dep._id)}
                              disabled={processingId === dep._id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white font-medium transition hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {processingId === dep._id ? (
                                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Processing</>
                              ) : "Reject"}
                            </button>
                          )}
                          {!canApprove && !canReject && (
                            <span className="text-xs text-slate-400">View only</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination page={safePage} totalPages={totalPagesSafe} onPageChange={goToPage} />
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          {filter === "all" ? "No deposits found." : `No ${filter} deposits found.`}
        </div>
      )}

      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-3xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -right-3 -top-3 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-slate-700 hover:text-slate-900">&times;</button>
            {previewImg.label && (
              <p className="mb-2 text-center text-sm font-medium text-white">{previewImg.label}</p>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg.src} alt={previewImg.label || "Payment proof"} className="max-h-[85vh] w-auto rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
