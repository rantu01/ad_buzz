"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../components/AdminProvider";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 20;

function getUsername(email) {
  if (!email) return "";
  if (email.includes("@")) return email.split("@")[0];
  return email;
}

function formatMoney(val) {
  const n = Number(val || 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function parsePerformer(desc) {
  const m = desc.match(/^(.+?)\s+\(([^)]+)\)\s+topped up/);
  return m ? { label: m[1], email: m[2] } : null;
}

const labelToRole = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([k, v]) => [v, k])
);

export default function TopUpInsightsPage() {
  const { profile, loading: profileLoading } = useAdmin();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const role = profile?.role;
  const isAdmin = role === ROLES.ADMIN;
  const isKeyManagerOrAccMgr = role === ROLES.KEY_MANAGER || role === ROLES.ACCOUNTS_MANAGER;

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin && !isKeyManagerOrAccMgr) return;

    async function load() {
      try {
        const res = await fetch(`/api/admin/top-up-insights?uid=all`);
        const data = await res.json();
        if (data.success) setInsights(data.insights || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, [profileLoading, isAdmin, isKeyManagerOrAccMgr, profile?.uid]);

  if (profileLoading || loading) {
    return <p className="text-slate-500">Loading insights...</p>;
  }

  if (!isAdmin && !isKeyManagerOrAccMgr) {
    return <p className="text-slate-500">You do not have access to this page.</p>;
  }

  const groupedByUser = {};
  for (const item of insights) {
    const key = item.accountUid || "unknown";
    if (!groupedByUser[key]) groupedByUser[key] = [];
    groupedByUser[key].push(item);
  }

  const totalTopUp = insights.reduce((s, i) => s + i.amount, 0);

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long" });
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const todayItems = insights.filter(i => {
    const d = new Date(i.createdAt);
    return d >= todayStart && d < todayEnd;
  });
  const todayTransactions = todayItems.length;
  const todayTopUp = todayItems.reduce((s, i) => s + i.amount, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthItems = insights.filter(i => {
    const d = new Date(i.createdAt);
    return d >= monthStart && d < monthEnd;
  });
  const monthByRole = {};
  for (const item of monthItems) {
    const parsed = parsePerformer(item.description);
    const roleKey = parsed ? (labelToRole[parsed.label] || "unknown") : (item.performedByRole || "unknown");
    if (!monthByRole[roleKey]) monthByRole[roleKey] = { count: 0, amount: 0 };
    monthByRole[roleKey].count += 1;
    monthByRole[roleKey].amount += item.amount;
  }
  const relevantRoles = ["admin", "key_manager", "accounts_manager"];

  const totalPages = Math.ceil(insights.length / ITEMS_PER_PAGE);
  const paginatedInsights = insights.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Top-Up Insights</h1>
      <p className="text-sm text-slate-500 mb-6">
        {isAdmin ? "All top-up transactions across all ad accounts" : "Top-up history for your assigned users' ad accounts"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Transactions</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{insights.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Top-Up (USD)</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">${formatMoney(totalTopUp)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Today's Transactions</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{todayTransactions}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Today's Top-Up (USD)</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">${formatMoney(todayTopUp)}</p>
        </div>
      </div>

      {monthItems.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">{monthName} {now.getFullYear()}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {relevantRoles.map((role) => (
              <div key={role} className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">Top-Up by {ROLE_LABELS[role] || role}</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">${formatMoney(monthByRole[role]?.amount || 0)}</p>
                <p className="text-xs text-slate-400 mt-1">{monthByRole[role]?.count || 0} transactions</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin ? (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Ad Account Name & ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Date & Time</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Performed By</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {insights.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No top-up data found.</td></tr>
                  ) : paginatedInsights.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{item.adAccountName || "—"}</div>
                        <div className="text-xs text-slate-400 font-mono">ID: {(item.adAccountId || "").replace(/^act_/, "")}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 align-top whitespace-nowrap">
                        <div>{new Date(item.createdAt).toLocaleDateString()}</div>
                        <div className="text-slate-300">{new Date(item.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium align-top whitespace-nowrap">${formatMoney(item.amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 align-top whitespace-nowrap">{(parsePerformer(item.description)?.email) || item.performedBy || "Unknown"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 align-top min-w-[180px] max-w-[280px] whitespace-normal break-words">{item.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <div className="space-y-6">
          {Object.keys(groupedByUser).length === 0 ? (
            <p className="text-slate-400 text-sm">No top-up data found for your assigned users.</p>
          ) : Object.entries(groupedByUser).map(([userKey, items]) => (
            <div key={userKey} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <span className="text-sm font-semibold text-slate-700">User: {getUsername(items[0]?.userEmail) || userKey}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Type</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-700">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">Ad Account Topup</span>
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium whitespace-nowrap">${formatMoney(item.amount)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 min-w-[180px] max-w-[280px] whitespace-normal break-words">{item.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
