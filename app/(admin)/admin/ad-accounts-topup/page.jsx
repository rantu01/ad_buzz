"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../components/AdminProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";

function timeAgo(date) {
  if (!date) return "\u2014";
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminAdAccountsTopUpPage() {
  const { profile } = useAdmin();
  const settings = useSettings();
  const defaultDollarRate = settings?.dollarRate || 129;
  const adminName = profile?.displayName || profile?.email || "Admin";

  const [adAccounts, setAdAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [topUpModal, setTopUpModal] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState("");

  const [openMenuId, setOpenMenuId] = useState(null);

  const [historyModal, setHistoryModal] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusBadge = (status, metaStatusLabel) => {
    const label = metaStatusLabel || (status === "active" ? "Active" : status === "disabled" ? "Disabled" : "Paused");
    const isActive = status === "active";
    const isDisabled = status === "disabled";
    return (
      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${isActive ? "bg-emerald-50 text-emerald-700" : isDisabled ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
        {label}
      </span>
    );
  };

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e) => {
      if (!e.target.closest('[data-menu]')) setOpenMenuId(null);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenuId]);

  useEffect(() => {
    async function loadData() {
      try {
        setError("");
        const [accountsRes] = await Promise.all([
          fetch("/api/admin/ad-accounts?includeUnassigned=true"),
        ]);
        const accountsData = await accountsRes.json();
        if (accountsData.success) setAdAccounts(accountsData.adAccounts || []);
        setLastRefreshedAt(new Date());
      } catch (err) {
        setError(err.message || "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const refreshBalances = async () => {
    try {
      const accountsRes = await fetch("/api/admin/ad-accounts?includeUnassigned=true");
      const accountsData = await accountsRes.json();
      if (accountsData.success) setAdAccounts(accountsData.adAccounts || []);
      setLastRefreshedAt(new Date());
    } catch {}
  };

  useEffect(() => {
    const id = setInterval(refreshBalances, 30000);
    return () => clearInterval(id);
  }, []);

  const totalBudget = adAccounts.reduce((s, a) => s + Number(a.metaSpendCap || a.spendCap || 0), 0);
  const totalSpent = adAccounts.reduce((s, a) => {
    const spent = a.metaStatus != null ? Number(a.metaAmountSpent || 0) : Number(a.spent || 0);
    return s + spent;
  }, 0);

  const openTopUp = (account) => {
    setTopUpModal(account);
    setTopUpAmount("");
    setTopUpError("");
  };

  const handleTopUp = async () => {
    const amount = Number(topUpAmount);
    if (!amount || amount <= 0) {
      setTopUpError("Enter a valid positive amount");
      return;
    }
    setTopUpLoading(true);
    setTopUpError("");
    try {
      const res = await fetch("/api/admin/ad-accounts/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: topUpModal._id, amount, performedBy: adminName }),
      });
      const data = await res.json();
      if (data.success) {
        setTopUpModal(null);
        await refreshBalances();
      } else {
        setTopUpError(data.message || "Top-up failed");
      }
    } catch (err) {
      setTopUpError(err.message || "Top-up failed");
    } finally {
      setTopUpLoading(false);
    }
  };

  const openHistory = async (account) => {
    setHistoryModal(account);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await fetch(`/api/user/ad-accounts/history?accountId=${account._id}`);
      const data = await res.json();
      if (data.success) {
        setHistoryData(data.history || []);
      }
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 animate-pulse">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-8 w-48 bg-slate-200 rounded mt-2" />
          <div className="h-4 w-64 bg-slate-200 rounded mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 bg-slate-200 rounded" />
                <div className="h-9 w-9 bg-slate-200 rounded-lg" />
              </div>
              <div className="h-8 w-28 bg-slate-200 rounded mt-4" />
              <div className="h-4 w-20 bg-slate-200 rounded mt-4" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
          <div className="flex items-center justify-between mb-5">
            <div className="h-5 w-32 bg-slate-200 rounded" />
            <div className="h-10 w-48 bg-slate-200 rounded-xl" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-1/4 bg-slate-200 rounded" />
                <div className="h-4 w-1/6 bg-slate-200 rounded" />
                <div className="h-5 w-14 bg-slate-200 rounded-full" />
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-4 w-16 bg-slate-200 rounded" />
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-8 w-24 bg-slate-200 rounded-lg ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Ad Accounts TopUp</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Ad Accounts TopUp</h1>
        <p className="text-sm text-slate-600 mt-1">Top up any ad account with unlimited balance.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="bg-white rounded-2xl border-2 border-amber-500/30 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-5 -mt-5"></div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin Balance</span>
              <span className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">Unlimited</div>
          </div>
          <div className="mt-4 text-xs font-semibold text-amber-700 bg-amber-50 py-1.5 px-3 rounded-md w-max">No restrictions</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Accounts</span>
              <span className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">{adAccounts.length} <span className="text-lg text-slate-400 font-normal">Accounts</span></div>
          </div>
          <div className="mt-4 text-xs font-medium text-purple-600 bg-purple-50/50 py-1.5 px-3 rounded-md w-max">{adAccounts.filter(a => a.status === "active").length} Active</div>
        </div>

        {/* <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Remaining Balance</span>
              <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">${formatMoney(totalBudget - totalSpent)}</div>
          </div>
          <div className="mt-4 text-xs font-medium text-emerald-600 bg-emerald-50/50 py-1.5 px-3 rounded-md w-max">Balance</div>
        </div> */}

        {/* <div className="bg-white rounded-2xl border-2 border-amber-500/30 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-5 -mt-5"></div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Conversion Rate</span>
              <span className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-4 whitespace-nowrap">{defaultDollarRate} BDT = 1 USD</div>
          </div>
          <div className="mt-4 text-xs font-semibold text-amber-700 bg-amber-50 py-1.5 px-3 rounded-md w-max">Exchange Rate</div>
        </div> */}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <h3 className="text-lg font-bold text-slate-900">Ad Accounts</h3>
          <div className="relative w-full sm:max-w-xs">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              type="text"
              placeholder="Search accounts..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Meta Account ID</th>
                    <th className="pb-3 pr-4">Meta Status</th>
                    <th className="pb-3 pr-4">Remaining balance</th>
                    <th className="pb-3 pr-4">Last Refreshed</th>
                    <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {adAccounts.map((acc) => {
                const budgetNum = Number(acc.metaSpendCap || acc.spendCap || 0);
                const spentNum = acc.metaStatus != null ? Number(acc.metaAmountSpent || 0) : Number(acc.spent || 0);
                const spendPct = budgetNum > 0 ? Math.min((spentNum / budgetNum) * 100, 100) : 0;
                return (
                  <tr key={acc._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 pr-4 font-medium text-slate-900 max-w-[220px] truncate">{acc.metaAccountName || acc.name}</td>
                    <td className="py-4 pr-4 font-mono text-xs text-blue-600">{acc.metaAccountId || acc.accountId}</td>
                    <td className="py-4 pr-4">
                      {getStatusBadge(acc.status, acc.metaStatusLabel)}
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-semibold text-slate-900">{acc.currency || "USD"} ${formatMoney(budgetNum - spentNum)} </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${spendPct > 90 ? "bg-red-500" : spendPct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${spendPct}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-xs text-slate-400" title={acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toLocaleString() : ""}>
                      <span className="flex items-center gap-1">
                        {acc.lastSyncedAt ? timeAgo(acc.lastSyncedAt) : (lastRefreshedAt ? "Cached" : "Loading...")}
                      </span>
                    </td>
                    <td className="py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openTopUp(acc)}
                          className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-rose-600 text-white text-xs font-semibold rounded-lg hover:from-orange-700 hover:to-rose-700 transition shadow-sm"
                        >
                          Top Up
                        </button>
                        {/* <div className="relative" data-menu>
                          <button
                            onClick={() => setOpenMenuId(openMenuId === acc._id ? null : acc._id)}
                            className="text-slate-400 hover:text-slate-600 px-1.5 py-1 text-lg font-bold leading-none rounded-lg hover:bg-slate-100 transition"
                          >
                            ⋮
                          </button>
                          {openMenuId === acc._id && (
                            <div data-menu className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                              <button
                                onClick={() => { setOpenMenuId(null); openHistory(acc); }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
                              >
                                History
                              </button>
                            </div>
                          )}
                        </div> */}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {adAccounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 text-sm">No ad accounts found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {topUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Top Up</h2>
              <button onClick={() => setTopUpModal(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Account</span>
                  <span className="text-slate-900 font-medium truncate ml-4">{topUpModal.name}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Current Budget</span>
                  <span className="text-slate-900 font-medium">${formatMoney(Number(topUpModal.metaSpendCap || topUpModal.spendCap || 0))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Admin Balance</span>
                  <span className="text-amber-600 font-semibold">Unlimited</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                />
              </div>

              {Number(topUpAmount) > 0 && (() => {
                const amt = Number(topUpAmount);
                const curBudget = Number(topUpModal.metaSpendCap || topUpModal.spendCap || 0);
                const newBudget = curBudget + amt;
                return (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-2">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Preview</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Current Budget</span>
                      <span className="text-slate-800 font-medium">${formatMoney(curBudget)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Top-Up Amount</span>
                      <span className="text-emerald-600 font-semibold">+${formatMoney(amt)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-blue-200 pt-2">
                      <span className="text-slate-800 font-semibold">New Budget</span>
                      <span className="text-slate-900 font-bold">${formatMoney(newBudget)}</span>
                    </div>
                  </div>
                );
              })()}

              {topUpError && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 border border-red-200">{topUpError}</p>}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setTopUpModal(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTopUp}
                  disabled={topUpLoading}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-rose-600 text-white text-sm font-semibold rounded-xl hover:from-orange-700 hover:to-rose-700 transition disabled:opacity-50 shadow-sm"
                >
                  {topUpLoading ? "Processing..." : "Confirm Top Up"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Transaction History</h2>
                <p className="text-sm text-slate-500 mt-0.5">{historyModal.name}</p>
              </div>
              <button onClick={() => setHistoryModal(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {historyLoading ? (
                <p className="text-slate-500 text-center py-8 text-sm">Loading history...</p>
              ) : historyData.length === 0 ? (
                <p className="text-slate-400 text-center py-8 text-sm">No top-up history found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 pr-4">Previous Budget</th>
                        <th className="pb-3 pr-4">Top-Up Amount</th>
                        <th className="pb-3 pr-4">New Budget</th>
                        <th className="pb-3 pr-4">Date & Time</th>
                        <th className="pb-3 pr-4">Transaction ID</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3">Performed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {historyData.map((h) => (
                        <tr key={h._id}>
                          <td className="py-3 pr-4">${formatMoney(h.previousBudget)}</td>
                          <td className="py-3 pr-4 text-emerald-600 font-medium">+${formatMoney(h.topUpAmount)}</td>
                          <td className="py-3 pr-4 font-medium">${formatMoney(h.newBudget)}</td>
                          <td className="py-3 pr-4 text-xs text-slate-500">{new Date(h.date).toLocaleString()}</td>
                          <td className="py-3 pr-4 text-xs font-mono text-slate-400">{String(h.transactionId).slice(-8)}</td>
                          <td className="py-3 pr-4">
                            <span className="px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full">Success</span>
                          </td>
                          <td className="py-3 text-xs text-slate-500">{h.performedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
              <button
                onClick={() => setHistoryModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
