"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

export default function BalancePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [dashboard, setDashboard] = useState({ availableBalance: 0, totalDeposited: 0, totalWithdrawn: 0 });
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    async function loadData() {
      if (!user?.uid) { setIsLoading(false); return; }
      try {
        setError("");
        const [dashboardRes, depositsRes, withdrawalsRes] = await Promise.all([
          fetch(`/api/user/dashboard?uid=${encodeURIComponent(user.uid)}`),
          fetch(`/api/user/deposit?uid=${encodeURIComponent(user.uid)}`),
          fetch(`/api/user/withdrawal?uid=${encodeURIComponent(user.uid)}`),
        ]);
        const d = await dashboardRes.json();
        const dep = await depositsRes.json();
        const wd = await withdrawalsRes.json();
        if (!d.success) throw new Error(d.message || "Failed to load data.");
        setDashboard(d.dashboard);
        setDeposits(dep.deposits || []);
        setWithdrawals(wd.withdrawals || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user?.uid]);

  const approvedDeposits = deposits.filter(d => d.status === "approved").reduce((s, d) => s + Number(d.amount), 0);
  const approvedWithdrawals = withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + Number(w.amount), 0);

  if (authLoading || isLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading balance...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Balance</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Balance Overview</h1>
        <p className="text-sm text-slate-600 mt-1">Summary of your financial activity within Ad Buzz.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Available Balance</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">${formatMoney(dashboard.availableBalance)}</p>
          <p className="text-xs text-emerald-600 mt-2 font-medium">Current Wallet</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Deposited</p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">${formatMoney(approvedDeposits)}</p>
          <p className="text-xs text-emerald-600 mt-2 font-medium">All approved deposits</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Withdrawn</p>
          <p className="text-3xl font-bold text-red-700 mt-2">${formatMoney(approvedWithdrawals)}</p>
          <p className="text-xs text-red-600 mt-2 font-medium">All approved withdrawals</p>
        </div>
        <div className="bg-white rounded-2xl border-2 border-orange-400/30 p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-10 -mt-10"></div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold relative z-10">Net Balance</p>
          <p className={`text-3xl font-bold mt-2 relative z-10 ${(approvedDeposits - approvedWithdrawals) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            ${formatMoney(approvedDeposits - approvedWithdrawals)}
          </p>
          <p className={`text-xs mt-2 font-medium relative z-10 ${(approvedDeposits - approvedWithdrawals) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {approvedDeposits - approvedWithdrawals >= 0 ? 'Positive' : 'Negative'} cash flow
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Approved Deposits</h3>
            <span onClick={() => router.push("/user-dashboard/deposits")} className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">View All</span>
          </div>
          {deposits.filter(d => d.status === "approved").length === 0 ? (
            <p className="text-slate-500 text-sm py-2">No approved deposits yet.</p>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {deposits.filter(d => d.status === "approved").slice(0, 5).map((d) => (
                <div key={d._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div>
                    <p className="font-bold text-emerald-700">+${formatMoney(d.amount)}</p>
                    <p className="text-[11px] text-slate-400">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 capitalize">{d.paymentMethod || 'bank_transfer'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Approved Withdrawals</h3>
            <span onClick={() => router.push("/user-dashboard/withdrawals")} className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">View All</span>
          </div>
          {withdrawals.filter(w => w.status === "approved").length === 0 ? (
            <p className="text-slate-500 text-sm py-2">No approved withdrawals yet.</p>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {withdrawals.filter(w => w.status === "approved").slice(0, 5).map((w) => (
                <div key={w._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-red-700">-${formatMoney(w.amount)}</p>
                    <p className="text-[11px] text-slate-400">{new Date(w.createdAt).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 truncate font-mono">{w.walletAddress}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
