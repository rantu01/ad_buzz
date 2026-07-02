"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../components/AdminProvider";
import { hasPermission } from "@/lib/permissions";
import Swal from "sweetalert2";

export default function AdminDepositsPage() {
  const { profile } = useAdmin();
  const role = profile?.role || "customer";
  const canApprove = hasPermission(role, "approve_deposits");
  const canReject = hasPermission(role, "reject_deposits");

  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [previewImg, setPreviewImg] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const loadDeposits = async () => {
    setLoading(true);
    try {
      const query = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/deposits${query}`);
      const data = await res.json();
      if (data.success) setDeposits(data.deposits || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDeposits(); }, [filter]);

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
        body: JSON.stringify({ depositId, status: "approved", approverUid: profile?.email || "admin" }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        await Swal.fire({ icon: "error", title: "Failed", text: result.message });
        return;
      }
      await Swal.fire({ icon: "success", title: "Approved", timer: 1200, showConfirmButton: false });
      loadDeposits();
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (depositId) => {
    const { value: reason } = await Swal.fire({
      icon: "warning", title: "Reject Deposit", input: "text", inputLabel: "Reason for rejection",
      inputPlaceholder: "Enter reason...", showCancelButton: true, confirmButtonText: "Reject",
    });
    if (!reason) return;
    setProcessingId(depositId);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId, status: "rejected", rejectionReason: reason }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        await Swal.fire({ icon: "error", title: "Failed", text: result.message });
        return;
      }
      await Swal.fire({ icon: "success", title: "Rejected", timer: 1200, showConfirmButton: false });
      loadDeposits();
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

      <div className="mb-6 flex gap-2">
        {["pending", "approved", "rejected"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${
              filter === status
                ? "bg-[#F59E0B] text-slate-950"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : deposits.length ? (
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
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Method</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">SS</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Reason</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deposits.map((dep) => (
                  <tr key={dep._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {new Date(dep.createdAt).toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap text-xs">{dep.email || dep.uid}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{dep.account || "—"}</td>
                    <td className="px-4 py-3 text-slate-800 text-right whitespace-nowrap text-xs">{dep.amountBDT ? `${formatMoney(dep.amountBDT)}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-800 text-right whitespace-nowrap text-xs">${formatMoney(dep.creditedUSD || dep.amount)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">{dep.transactionRef || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize whitespace-nowrap text-xs">{(dep.paymentMethod || "").replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {dep.screenshot ? (
                        <button onClick={() => setPreviewImg(dep.screenshot)} className="inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={dep.screenshot} alt="ss" className="w-10 h-10 rounded-md object-cover border border-slate-200 hover:ring-2 hover:ring-orange-400 transition-shadow" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">{statusBadge(dep.status)}</td>
                    <td className="px-4 py-3 text-slate-500 text-[11px] max-w-[140px]">
                      {dep.status === "rejected" ? (dep.rejectionReason || "—") : "—"}
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
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No {filter} deposits found.
        </div>
      )}

      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-3xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -right-3 -top-3 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-slate-700 hover:text-slate-900">&times;</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Payment proof" className="max-h-[85vh] w-auto rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
