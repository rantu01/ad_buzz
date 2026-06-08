"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

export default function UserDashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [dashboard, setDashboard] = useState({ availableBalance: 0 });
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [adAccounts, setAdAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    async function loadDashboard() {
      if (!user?.uid) { setIsLoading(false); return; }
      try {
        setError("");
        const [dashboardRes, depositsRes, withdrawalsRes, accountsRes] = await Promise.all([
          fetch(`/api/user/dashboard?uid=${encodeURIComponent(user.uid)}`),
          fetch(`/api/user/deposit?uid=${encodeURIComponent(user.uid)}`),
          fetch(`/api/user/withdrawal?uid=${encodeURIComponent(user.uid)}`),
          fetch(`/api/user/ad-accounts?uid=${encodeURIComponent(user.uid)}`),
        ]);
        const dashboardResult = await dashboardRes.json();
        const depositsResult = await depositsRes.json();
        const withdrawalsResult = await withdrawalsRes.json();
        const accountsResult = await accountsRes.json();
        if (!dashboardRes.ok || !dashboardResult.success) throw new Error(dashboardResult.message || "Failed to load dashboard.");
        setDashboard(dashboardResult.dashboard);
        setDeposits(depositsResult.deposits || []);
        setWithdrawals(withdrawalsResult.withdrawals || []);
        setAdAccounts(accountsResult.adAccounts || []);
      } catch (err) {
        setError(err.message || "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [user?.uid]);

  if (loading || isLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading dashboard...</div>;

  if (!user) {
    return (<div className="max-w-7xl mx-auto px-4 py-10 text-center"><h1 className="text-2xl font-bold text-slate-900">User Dashboard</h1><p className="mt-2 text-slate-600">Please login to view your dashboard.</p></div>);
  }

  const totalBudget = adAccounts.reduce((s, a) => s + Number(a.budget || 0), 0);
  const totalSpent = adAccounts.reduce((s, a) => s + Number(a.spent || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Welcome back</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-0.5">{user.displayName || user.email?.split('@')[0] || 'User'}!</h1>
          <p className="text-sm text-slate-600 mt-1">Manage your ad accounts, balance and requests efficiently.</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm">{error}</div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet Balance</span>
              <span className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">${formatMoney(dashboard.availableBalance)}</div>
          </div>
          <div className="mt-4 text-xs font-medium text-blue-600 bg-blue-50/50 py-1.5 px-3 rounded-md w-max">Available USD</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ad Accounts</span>
              <span className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">{adAccounts.length} <span className="text-lg text-slate-400 font-normal">Accounts</span></div>
          </div>
          <div className="mt-4 text-xs font-medium text-purple-600 bg-purple-50/50 py-1.5 px-3 rounded-md w-max">{adAccounts.filter(a => a.status === "active").length} Active</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Budget</span>
              <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">${formatMoney(totalBudget)}</div>
          </div>
          <div className="mt-4 text-xs font-medium text-emerald-600 bg-emerald-50/50 py-1.5 px-3 rounded-md w-max">${formatMoney(totalSpent)} Spent</div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-amber-500/30 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-5 -mt-5"></div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Remaining Budget</span>
              <span className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">${formatMoney(totalBudget - totalSpent)}</div>
          </div>
          <div className="mt-4 text-xs font-semibold text-amber-700 bg-amber-50 py-1.5 px-3 rounded-md w-max">Remaining</div>
        </div>
      </div>

      {dashboard.accountStatus === 'frozen' && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-sm text-red-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div><span className="font-semibold">Account Frozen:</span> {dashboard.freezeReason || 'Contact support.'}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Recent Deposits</h3>
            <span onClick={() => router.push("/user-dashboard/deposits")} className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">View All</span>
          </div>
          <div className="space-y-3">
            {deposits.length ? deposits.slice(0, 3).map((deposit) => (
              <div key={deposit._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 transition hover:bg-slate-100/50">
                <div>
                  <p className="font-bold text-slate-900">${formatMoney(deposit.amount)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{new Date(deposit.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${deposit.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : deposit.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{deposit.status}</span>
              </div>
            )) : <p className="text-sm text-slate-500 py-2">No deposits registered yet.</p>}
          </div>
        </div>

        {/* <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Recent Withdrawals</h3>
            <span onClick={() => router.push("/user-dashboard/withdrawals")} className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">View All</span>
          </div>
          <div className="space-y-3">
            {withdrawals.length ? withdrawals.slice(0, 3).map((withdrawal) => (
              <div key={withdrawal._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 transition hover:bg-slate-100/50">
                <div>
                  <p className="font-bold text-slate-900">${formatMoney(withdrawal.amount)}</p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-[180px]">{withdrawal.walletAddress}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${withdrawal.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : withdrawal.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{withdrawal.status}</span>
              </div>
            )) : <p className="text-sm text-slate-500 py-2">No withdrawals registered yet.</p>}
          </div>
        </div> */}
      </div>
    </div>
  );
}
