"use client";

import { useEffect, useState } from "react";

export default function TopUpInsightsPage() {
  const [adAccounts, setAdAccounts] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [accountsRes, depositsRes] = await Promise.all([
          fetch("/api/admin/ad-accounts"),
          fetch("/api/admin/deposits"),
        ]);
        const accountsData = await accountsRes.json();
        const depositsData = await depositsRes.json();
        setAdAccounts(accountsData.adAccounts || []);
        setDeposits(depositsData.deposits || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const formatMoney = (val) => {
    const n = Number(val || 0);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
  };

  const insights = adAccounts.map((acc) => {
    const accountDeposits = deposits.filter((d) => d.account === acc.accountId || d.email === acc.email);
    const totalTopUp = accountDeposits.reduce((s, d) => s + (d.status === "approved" ? Number(d.amount || 0) : 0), 0);
    const pendingTopUp = accountDeposits.reduce((s, d) => s + (d.status === "pending" ? Number(d.amount || 0) : 0), 0);
    return {
      ...acc,
      totalTopUp,
      pendingTopUp,
      totalTopUpBDT: accountDeposits.reduce((s, d) => s + (d.status === "approved" ? Number(d.amountBDT || 0) : 0), 0),
    };
  }).sort((a, b) => b.totalTopUp - a.totalTopUp);

  const grandTotalUSD = insights.reduce((s, i) => s + i.totalTopUp, 0);
  const grandTotalBDT = insights.reduce((s, i) => s + i.totalTopUpBDT, 0);

  if (loading) return <p className="text-slate-500">Loading insights...</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Top-Up Insights</h1>
      <p className="text-sm text-slate-500 mb-6">View how much balance has been topped up to each ad account</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Ad Accounts</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{insights.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Top-Up (USD)</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">${formatMoney(grandTotalUSD)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Top-Up (BDT)</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{formatMoney(grandTotalBDT)} BDT</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Ad Account</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">User</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Approved (USD)</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Approved (BDT)</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Pending (USD)</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Total Top-Ups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {insights.map((acc) => (
                <tr key={acc._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-medium">{acc.name || acc.accountId || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{acc.email || "—"}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">${formatMoney(acc.totalTopUp)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatMoney(acc.totalTopUpBDT)} BDT</td>
                  <td className="px-4 py-3 text-right text-amber-600">${formatMoney(acc.pendingTopUp)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{deposits.filter((d) => d.account === acc.accountId || d.email === acc.email).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
