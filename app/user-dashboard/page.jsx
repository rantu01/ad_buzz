"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between animate-pulse">
      <div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-9 w-9 bg-slate-200 rounded-lg" />
        </div>
        <div className="h-8 w-28 bg-slate-200 rounded mt-4" />
      </div>
      <div className="h-4 w-20 bg-slate-200 rounded mt-4" />
    </div>
  );
}

function SkeletonTable({ rows = 3 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-32 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-3 w-16 bg-slate-200 rounded" />
            </div>
            <div className="h-5 w-16 bg-slate-200 rounded-full" />
          </div>
        ))}
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

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading dashboard...</div>;

  if (!user) {
    return (<div className="max-w-7xl mx-auto px-4 py-10 text-center"><h1 className="text-2xl font-bold text-slate-900">User Dashboard</h1><p className="mt-2 text-slate-600">Please login to view your dashboard.</p></div>);
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
          <div className="h-8 w-48 bg-slate-200 rounded mt-2 animate-pulse" />
          <div className="h-4 w-72 bg-slate-200 rounded mt-2 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SkeletonTable rows={3} />
          <SkeletonTable rows={3} />
        </div>
      </div>
    );
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
          {deposits.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No deposits registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3 text-right">Amount</th>
                    <th className="pb-2 pr-3">Method</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deposits.slice(0, 5).map((deposit) => (
                    <tr key={deposit._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{new Date(deposit.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-slate-900 whitespace-nowrap">${formatMoney(deposit.amount)}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-600 capitalize whitespace-nowrap">{(deposit.paymentMethod || "bank_transfer").replace(/_/g, " ")}</td>
                      <td className="py-2.5">{statusBadge(deposit.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Quick Actions</h3>
          </div>
          <div className="space-y-3">
            <button onClick={() => router.push("/user-dashboard/ad-account")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition text-left">
              <span className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Top Up Ad Account</p>
                <p className="text-xs text-slate-500">Add budget to your ad accounts</p>
              </div>
            </button>
            <button onClick={() => router.push("/user-dashboard/deposits")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition text-left">
              <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">New Deposit</p>
                <p className="text-xs text-slate-500">Add funds to your wallet</p>
              </div>
            </button>
            <button onClick={() => router.push("/user-dashboard/profile")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition text-left">
              <span className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Profile Settings</p>
                <p className="text-xs text-slate-500">Update your personal information</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
