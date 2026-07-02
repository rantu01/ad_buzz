"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "./components/AdminProvider";
import { hasPermission } from "@/lib/permissions";

export default function DashboardPage() {
  const { profile } = useAdmin();
  const role = profile?.role || "customer";
  const [stats, setStats] = useState({
    users: 0, pendingDeposits: 0, pendingWithdrawals: 0,
    totalDeposits: 0, totalWithdrawals: 0, adAccounts: 0,
    openTickets: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const calls = [];
        if (hasPermission(role, "view_users")) calls.push(fetch("/api/admin/users").then(r => r.json()).then(d => ({ users: (d.users || []).length })).catch(() => ({})));
        if (hasPermission(role, "view_deposits") || hasPermission(role, "approve_deposits")) calls.push(fetch("/api/admin/deposits").then(r => r.json()).then(d => {
          const deps = d.deposits || [];
          return { pendingDeposits: deps.filter(x => x.status === "pending").length, totalDeposits: deps.length };
        }).catch(() => ({})));
        if (hasPermission(role, "view_withdrawals") || hasPermission(role, "approve_withdrawals")) calls.push(fetch("/api/admin/withdrawals").then(r => r.json()).then(d => {
          const wds = d.withdrawals || [];
          return { pendingWithdrawals: wds.filter(x => x.status === "pending").length, totalWithdrawals: wds.length };
        }).catch(() => ({})));
        if (hasPermission(role, "view_ad_accounts")) calls.push(fetch("/api/admin/ad-accounts").then(r => r.json()).then(d => ({ adAccounts: (d.adAccounts || []).length })).catch(() => ({})));
        if (hasPermission(role, "view_tickets")) calls.push(fetch("/api/admin/support-tickets").then(r => r.json()).then(d => ({ openTickets: (d.tickets || []).filter(x => x.status !== "closed").length })).catch(() => ({})));

        const results = await Promise.all(calls);
        const merged = Object.assign({}, ...results);
        if (!cancelled) setStats((prev) => ({ ...prev, ...merged }));
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [role]);

  const cards = [
    ...(hasPermission(role, "view_users") ? [{ label: "Total Users", value: stats.users, color: "bg-blue-50 text-blue-600 border-blue-200" }] : []),
    ...(hasPermission(role, "view_ad_accounts") ? [{ label: "Ad Accounts", value: stats.adAccounts, color: "bg-purple-50 text-purple-600 border-purple-200" }] : []),
    ...(hasPermission(role, "view_deposits") ? [{ label: "Pending Deposits", value: stats.pendingDeposits, color: "bg-amber-50 text-amber-600 border-amber-200" }] : []),
    ...(hasPermission(role, "view_withdrawals") ? [{ label: "Pending Withdrawals", value: stats.pendingWithdrawals, color: "bg-red-50 text-red-600 border-red-200" }] : []),
    ...(hasPermission(role, "view_deposits") ? [{ label: "Total Deposits", value: stats.totalDeposits, color: "bg-emerald-50 text-emerald-600 border-emerald-200" }] : []),
    ...(hasPermission(role, "view_withdrawals") ? [{ label: "Total Withdrawals", value: stats.totalWithdrawals, color: "bg-indigo-50 text-indigo-600 border-indigo-200" }] : []),
    ...(hasPermission(role, "view_tickets") ? [{ label: "Open Tickets", value: stats.openTickets, color: "bg-rose-50 text-rose-600 border-rose-200" }] : []),
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Dashboard Overview</h1>
      <p className="text-sm text-slate-500 mb-6">Real-time platform statistics and metrics</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-5 ${card.color}`}>
            <p className="text-sm font-medium opacity-80">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{loading ? "..." : card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
