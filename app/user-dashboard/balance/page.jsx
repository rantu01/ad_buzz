"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import useSSE from "@/app/Component/Hooks/useSSE";

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
      <div className="h-3 w-28 bg-slate-200 rounded" />
      <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
      <div className="h-3 w-20 bg-slate-200 rounded mt-3" />
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-36 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <div className="space-y-2">
              <div className="h-4 w-20 bg-slate-200 rounded" />
              <div className="h-3 w-28 bg-slate-200 rounded" />
            </div>
            <div className="h-5 w-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BalancePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const uid = user?.uid;

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const dashboardQuery = useQuery({
    queryKey: ["user", "dashboard", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/dashboard?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load data.");
      return data.dashboard;
    },
    enabled: Boolean(uid),
    refetchInterval: 60000,
  });
  const dashboard = dashboardQuery.data || { availableBalance: 0, totalEarned: 0 };

  const depositsQuery = useQuery({
    queryKey: ["user", "deposits", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/deposit?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!data.success) throw new Error("Failed to load deposits");
      return data.deposits || [];
    },
    enabled: Boolean(uid),
  });
  const deposits = depositsQuery.data || [];

  const manualLogsQuery = useQuery({
    queryKey: ["user", "manual-logs", uid],
    queryFn: async () => {
      const params = new URLSearchParams({ uid, type: "admin", limit: "100" });
      const res = await fetch(`/api/user/balance-logs?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error("Failed to load manual deposits");
      return data.logs || [];
    },
    enabled: Boolean(uid),
  });
  const manualLogs = manualLogsQuery.data || [];

  const isLoading = authLoading || (dashboardQuery.isLoading && depositsQuery.isLoading);
  const error = dashboardQuery.isError ? dashboardQuery.error.message : "";

  useSSE({
    uid,
    onEvent: (type) => {
      if (type === "balance") {
        queryClient.invalidateQueries({ queryKey: ["user", "dashboard", uid] });
        queryClient.invalidateQueries({ queryKey: ["user", "deposits", uid] });
        queryClient.invalidateQueries({ queryKey: ["user", "manual-logs", uid] });
      }
    },
  });

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading balance...</div>;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 animate-pulse">
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-8 w-48 bg-slate-200 rounded mt-2" />
          <div className="h-4 w-64 bg-slate-200 rounded mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SkeletonPanel />
          <SkeletonPanel />
        </div>
      </div>
    );
  }

  const approvedDeposits = deposits.filter(d => d.status === "approved").reduce((s, d) => s + Number(d.amount), 0);

  const currentMonthName = new Date().toLocaleString("en-US", { month: "long" });
  const now = new Date();
  const currentMonthDeposit = deposits
    .filter((d) => {
      if (d.status !== "approved" || !d.createdAt) return false;
      const dt = new Date(d.createdAt);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((s, d) => s + Number(d.amount || 0), 0);

  const totalManualBalancePush = manualLogs
    .filter((l) => Number(l.amount) > 0)
    .reduce((s, l) => s + Number(l.amount || 0), 0);

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
       
        <div className="bg-white rounded-2xl border-2 border-orange-400/30 p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-10 -mt-10"></div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold relative z-10">Current Month Deposit ({currentMonthName})</p>
          <p className="text-3xl font-bold mt-2 relative z-10 text-orange-700">
            ${formatMoney(currentMonthDeposit)}
          </p>
          <p className="text-xs mt-2 font-medium relative z-10 text-orange-600">
            Approved deposits in {currentMonthName}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Manual Balance Push</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">${formatMoney(totalManualBalancePush)}</p>
          <p className="text-xs text-slate-500 mt-2 font-medium">Admin added balance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Deposits History</h3>
            <span onClick={() => router.push("/user-dashboard/deposits")} className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">View All</span>
          </div>
          {deposits.filter(d => d.status === "approved").length === 0 ? (
            <p className="text-slate-500 text-sm py-2">No deposits history yet.</p>
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
            <h3 className="text-lg font-bold text-slate-900">Manual Deposits History</h3>
            <span onClick={() => router.push("/user-dashboard/balance-history")} className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">View All</span>
          </div>
          {manualLogsQuery.isLoading ? (
            <p className="text-slate-500 text-sm py-2">Loading manual deposits...</p>
          ) : manualLogs.length === 0 ? (
            <p className="text-slate-500 text-sm py-2">No manual deposits history yet.</p>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {manualLogs.slice(0, 5).map((l) => (
                <div key={l._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div>
                    <p className={`font-bold ${Number(l.amount) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {Number(l.amount) >= 0 ? "+" : ""}${formatMoney(l.amount)}
                    </p>
                    <p className="text-[11px] text-slate-400">{new Date(l.createdAt).toLocaleString()}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 capitalize">Manual Balance Push</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
