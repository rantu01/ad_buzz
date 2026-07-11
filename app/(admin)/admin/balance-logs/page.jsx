"use client";

import { useEffect, useState } from "react";

const TYPE_LABELS = {
  ad_account_topup: "Ad Account Topup",
  admin: "Manual Balance Push",
  deposit: "Deposit",
};

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "ad_account_topup", label: "Ad Account Topup" },
  { value: "admin", label: "Manual Balance Push" },
  // { value: "deposit", label: "Deposit" },
];

function getTypeLabel(type) {
  return TYPE_LABELS[type] || type;
}

function getTypeStyle(type) {
  if (type === "ad_account_topup") return "bg-blue-50 text-blue-700";
  if (type === "admin") return "bg-amber-50 text-amber-700";
  if (type === "deposit") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-50 text-slate-700";
}

function getUsername(email) {
  if (!email) return "";
  if (email.includes("@")) return email.split("@")[0];
  return email;
}

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

      <div className="mb-6 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.value}
            onClick={() => { setFilter(t.value); setPage(1); }}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${
              filter === t.value
                ? "bg-[#F59E0B] text-slate-950"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
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
                  <td className="py-3 px-4 text-xs text-slate-400 align-top whitespace-nowrap">
                    <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                    <div className="text-slate-300">{new Date(log.createdAt).toLocaleTimeString()}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700 align-top whitespace-nowrap">{getUsername(log.email)}</td>
                  <td className="py-3 px-4 align-top">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeStyle(log.type)}`}>
                      {getTypeLabel(log.type)}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium align-top whitespace-nowrap">${formatMoney(Math.abs(log.amount))}</td>
                  <td className="py-3 px-4 align-top whitespace-nowrap">${formatMoney(log.balanceBefore)}</td>
                  <td className="py-3 px-4 align-top whitespace-nowrap">${formatMoney(log.balanceAfter)}</td>
                  <td className="py-3 px-4 text-xs text-slate-500 align-top min-w-[200px] max-w-[300px] whitespace-normal break-words">{log.description}</td>
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
