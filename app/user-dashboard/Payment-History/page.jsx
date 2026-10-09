"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useUserAlerts } from "../components/UserAlertProvider";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 20;

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 w-16 bg-slate-200 rounded ml-auto" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 w-16 bg-slate-200 rounded ml-auto" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
      <td className="px-4 py-3 text-center"><div className="h-10 w-10 bg-slate-200 rounded-md mx-auto" /></td>
      <td className="px-4 py-3 text-center"><div className="h-5 w-16 bg-slate-200 rounded-full mx-auto" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
    </tr>
  );
}

export default function PaymentHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const { depositSeq } = useUserAlerts();
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [previewImg, setPreviewImg] = useState(null);

  const loadDeposits = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setError("");
      const res = await fetch(`/api/user/deposit?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load payment history.");
      setDeposits(data.deposits || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadDeposits(); }, [loadDeposits]);

  // Live update: an approval/rejection pushes a notify event and the list
  // refreshes so the new stage is visible immediately.
  useEffect(() => {
    if (depositSeq > 0) loadDeposits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositSeq]);

  const totalPages = Math.ceil(deposits.length / ITEMS_PER_PAGE);
  const paginatedDeposits = deposits.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading payment history...</div>;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 animate-pulse">
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-8 w-48 bg-slate-200 rounded mt-2" />
          <div className="h-4 w-64 bg-slate-200 rounded mt-2" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Date", "Account", "Amount (BDT)", "Credited (USD)", "Transaction Ref", "Payment Method", "Screenshot", "Status", "Rejection Reason"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left">
                      <div className="h-3 w-16 bg-slate-200 rounded" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Payments</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Payment History</h1>
        <p className="text-sm text-slate-600 mt-1">View all your deposit requests and their current status.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      {deposits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 font-medium">No payments yet.</p>
          <p className="text-xs text-slate-400 mt-1">Make your first deposit to see it here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Account</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Amount (BDT)</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Credited (USD)</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Transaction Ref</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Payment Method</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Screenshot</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Rejection Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDeposits.map((dep) => (
                  <tr key={dep._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(dep.createdAt).toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{dep.account || "—"}</td>
                    <td className="px-4 py-3 text-slate-800 text-right whitespace-nowrap">{dep.amountBDT ? `${formatMoney(dep.amountBDT)}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-800 text-right whitespace-nowrap">${formatMoney(dep.creditedUSD || dep.amount)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-xs">{dep.transactionRef || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize whitespace-nowrap">{(dep.paymentMethod || "").replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {dep.screenshot ? (
                        <button onClick={() => setPreviewImg({ src: dep.screenshot, label: "Payment Screenshot" })} className="inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={dep.screenshot} alt="screenshot" className="w-10 h-10 rounded-md object-cover border border-slate-200 hover:ring-2 hover:ring-orange-400 transition-shadow mx-auto" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">{statusBadge(dep.status)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px]">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-3xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -right-3 -top-3 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-slate-700 hover:text-slate-900">&times;</button>
            {previewImg.label && (
              <p className="mb-2 text-center text-sm font-medium text-white">{previewImg.label}</p>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg.src} alt={previewImg.label || "Preview"} className="max-h-[85vh] w-auto rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
