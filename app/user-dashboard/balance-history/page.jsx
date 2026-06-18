"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 w-16 bg-slate-200 rounded ml-auto" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 w-16 bg-slate-200 rounded ml-auto" /></td>
      <td className="px-4 py-3 hidden md:table-cell"><div className="h-3 w-40 bg-slate-200 rounded" /></td>
    </tr>
  );
}

export default function BalanceHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const loadLogs = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoading(true);
    try {
      setError("");
      const params = new URLSearchParams({ uid: user.uid, page: String(page), limit: "20" });
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/user/balance-logs?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load balance logs.");
      setLogs(data.logs || []);
      setTotalPages(data.totalPages || 1);
      setTotalLogs(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, page, typeFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Balance</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Balance History</h1>
          <p className="text-sm text-slate-600 mt-1">Complete transaction history ({totalLogs} entries).</p>
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 bg-white">
          <option value="">All Types</option>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="payment">Payment</option>
          <option value="refund">Refund</option>
          <option value="admin">Admin Adjustment</option>
        </select>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 font-semibold text-slate-600 uppercase text-[11px] tracking-wider">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600 uppercase text-[11px] tracking-wider">Type</th>
                <th className="px-4 py-3 font-semibold text-slate-600 uppercase text-[11px] tracking-wider text-right">Amount</th>
                <th className="px-4 py-3 font-semibold text-slate-600 uppercase text-[11px] tracking-wider text-right">Balance After</th>
                <th className="px-4 py-3 font-semibold text-slate-600 uppercase text-[11px] tracking-wider hidden md:table-cell">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No balance logs found.</td></tr>
              ) : logs.map((log) => (
                <tr key={log._id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${log.type === 'deposit' ? 'bg-emerald-50 text-emerald-700' : log.type === 'withdrawal' ? 'bg-red-50 text-red-700' : log.type === 'payment' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>{log.type}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${Number(log.amount) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {Number(log.amount) >= 0 ? '+' : ''}${formatMoney(log.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900 font-medium whitespace-nowrap">${formatMoney(log.balanceAfter)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell max-w-[250px] truncate">{log.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Previous</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
