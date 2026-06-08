"use client";

import { useEffect, useState } from "react";

export default function AdminBalanceLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/balance-logs?type=${filter}&page=${page}&limit=50`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, [filter, page]);

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Balance Logs</h1>
      <p className="text-sm text-slate-500 mb-6">Transaction history across all users</p>

      <div className="mb-6 flex gap-2">
        {["all", "deposit", "withdrawal"].map((t) => (
          <button
            key={t}
            onClick={() => { setFilter(t); setPage(1); }}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${
              filter === t
                ? "bg-[#F59E0B] text-slate-950"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Balance Before</th>
                <th className="py-3 px-4">Balance After</th>
                <th className="py-3 px-4">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading...</td></tr>
              ) : logs.length > 0 ? logs.map((log, i) => (
                <tr key={log._id || i} className="hover:bg-slate-50/40">
                  <td className="py-3 px-4 text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="py-3 px-4 max-w-[120px] truncate text-xs">{log.email || log.uid?.slice(0, 16)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      log.type === "deposit" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>{log.type}</span>
                  </td>
                  <td className="py-3 px-4 font-medium">${formatMoney(Math.abs(log.amount))}</td>
                  <td className="py-3 px-4">${formatMoney(log.balanceBefore)}</td>
                  <td className="py-3 px-4">${formatMoney(log.balanceAfter)}</td>
                  <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">{log.description}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No balance logs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm disabled:opacity-50">Previous</button>
          <span className="px-4 py-2 text-sm text-slate-600">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
