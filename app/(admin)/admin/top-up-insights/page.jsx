"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../components/AdminProvider";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import Pagination from "@/app/Component/Pagination";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from "lucide-react";

const ITEMS_PER_PAGE = 20;

const ROLE_METRICS = [
  { key: "admin", label: "Topup By Admin" },
  { key: "key_manager", label: "Topup By Key Manager" },
  { key: "accounts_manager", label: "Topup By Accounts Manager" },
];

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

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function fmtMonth(d) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
      {sub ? <p className="text-xs text-slate-400 mt-1">{sub}</p> : null}
    </div>
  );
}

export default function TopUpInsightsPage() {
  const { profile, loading: profileLoading } = useAdmin();

  const role = profile?.role;
  const isAdmin = role === ROLES.ADMIN;
  const isKeyManagerOrAccMgr = role === ROLES.KEY_MANAGER || role === ROLES.ACCOUNTS_MANAGER;

  const today = new Date();

  const [selectedDay, setSelectedDay] = useState(() => startOfDay(today));
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(today));
  const [tableView, setTableView] = useState("day");
  const [page, setPage] = useState(1);

  const [overall, setOverall] = useState({ total: 0, totalAmount: 0 });
  const [dayItems, setDayItems] = useState([]);
  const [monthItems, setMonthItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async (params) => {
    try {
      const qs = new URLSearchParams(params);
      const res = await fetch(`/api/admin/top-up-insights?${qs}`);
      const data = await res.json();
      return data.success ? data : { insights: [], total: 0, totalAmount: 0 };
    } catch {
      return { insights: [], total: 0, totalAmount: 0 };
    }
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin && !isKeyManagerOrAccMgr) return;
    (async () => {
      const all = await fetchInsights({ uid: "all" });
      setOverall({ total: all.total, totalAmount: all.totalAmount });
      setLoading(false);
    })();
  }, [profileLoading, isAdmin, isKeyManagerOrAccMgr, fetchInsights]);

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin && !isKeyManagerOrAccMgr) return;
    const from = startOfDay(selectedDay);
    const to = addDays(from, 1);
    (async () => {
      const res = await fetchInsights({ uid: "all", from: from.toISOString(), to: to.toISOString() });
      setDayItems(res.insights || []);
    })();
  }, [profileLoading, isAdmin, isKeyManagerOrAccMgr, fetchInsights, selectedDay]);

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin && !isKeyManagerOrAccMgr) return;
    const from = startOfMonth(selectedMonth);
    const to = addMonths(from, 1);
    (async () => {
      const res = await fetchInsights({ uid: "all", from: from.toISOString(), to: to.toISOString() });
      setMonthItems(res.insights || []);
    })();
  }, [profileLoading, isAdmin, isKeyManagerOrAccMgr, fetchInsights, selectedMonth]);

  if (profileLoading || loading) {
    return <p className="text-slate-500">Loading insights...</p>;
  }

  if (!isAdmin && !isKeyManagerOrAccMgr) {
    return <p className="text-slate-500">You do not have access to this page.</p>;
  }

  function computeStats(items) {
    const byRole = {};
    for (const item of items) {
      let roleKey = item.performedByRole;
      if (!roleKey) {
        const parsed = parsePerformer(item.description);
        roleKey = parsed ? (labelToRole[parsed.label] || "unknown") : "unknown";
      }
      if (!byRole[roleKey]) byRole[roleKey] = { count: 0, amount: 0 };
      byRole[roleKey].count += 1;
      byRole[roleKey].amount += Number(item.amount || 0);
    }
    return byRole;
  }

  const dayStart = startOfDay(selectedDay);
  const dayAmount = dayItems.reduce((s, i) => s + Number(i.amount || 0), 0);
  const dayStats = computeStats(dayItems);
  const canNextDay = dayStart.getTime() < startOfDay(today).getTime();

  const monthStart = startOfMonth(selectedMonth);
  const monthAmount = monthItems.reduce((s, i) => s + Number(i.amount || 0), 0);
  const monthStats = computeStats(monthItems);
  const canNextMonth = monthStart.getTime() < startOfMonth(today).getTime();

  const tableItems = tableView === "day" ? dayItems : monthItems;
  const groupedByUser = {};
  for (const item of tableItems) {
    const key = item.accountUid || "unknown";
    if (!groupedByUser[key]) groupedByUser[key] = [];
    groupedByUser[key].push(item);
  }

  const totalPages = Math.ceil(tableItems.length / ITEMS_PER_PAGE);
  const paginatedItems = tableItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Top-Up Insights</h1>
      <p className="text-sm text-slate-500 mb-6">
        {isAdmin ? "All top-up transactions across all ad accounts" : "Top-up history for your assigned users' ad accounts"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <StatCard label="Total Transactions" value={overall.total.toLocaleString()} />
        <StatCard label="Total Top-Up (USD)" value={`$${formatMoney(overall.totalAmount)}`} />
      </div>

      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CalendarDays size={18} className="text-slate-400" /> Day-wise Topup Insights
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { setSelectedDay((d) => addDays(d, -1)); setPage(1); }} className="border border-slate-200 text-slate-600 rounded-lg p-2 hover:bg-slate-50 transition">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[220px] text-center">{fmtDay(selectedDay)}</span>
            <button onClick={() => { if (canNextDay) { setSelectedDay((d) => addDays(d, 1)); setPage(1); } }} disabled={!canNextDay} className="border border-slate-200 text-slate-600 rounded-lg p-2 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Transactions" value={dayItems.length.toLocaleString()} />
          <StatCard label="Total Amount (USD)" value={`$${formatMoney(dayAmount)}`} />
          {ROLE_METRICS.map((m) => (
            <StatCard
              key={m.key}
              label={m.label}
              value={`$${formatMoney(dayStats[m.key]?.amount || 0)}`}
              sub={`${dayStats[m.key]?.count || 0} transactions`}
            />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CalendarRange size={18} className="text-slate-400" /> Month-wise Topup Insights
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { setSelectedMonth((m) => addMonths(m, -1)); setPage(1); }} className="border border-slate-200 text-slate-600 rounded-lg p-2 hover:bg-slate-50 transition">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[180px] text-center">{fmtMonth(selectedMonth)}</span>
            <button onClick={() => { if (canNextMonth) { setSelectedMonth((m) => addMonths(m, 1)); setPage(1); } }} disabled={!canNextMonth} className="border border-slate-200 text-slate-600 rounded-lg p-2 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Transactions" value={monthItems.length.toLocaleString()} />
          <StatCard label="Total Amount (USD)" value={`$${formatMoney(monthAmount)}`} />
          {ROLE_METRICS.map((m) => (
            <StatCard
              key={m.key}
              label={m.label}
              value={`$${formatMoney(monthStats[m.key]?.amount || 0)}`}
              sub={`${monthStats[m.key]?.count || 0} transactions`}
            />
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Transaction Summary</h2>
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => { setTableView("day"); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tableView === "day" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            Day {fmtDay(selectedDay).split(",").slice(1).join(",").trim()}
          </button>
          <button
            onClick={() => { setTableView("month"); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tableView === "month" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            Month {fmtMonth(selectedMonth)}
          </button>
        </div>
      </div>

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
                  {tableItems.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No top-up data found.</td></tr>
                  ) : paginatedItems.map((item) => (
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
                      <td className="px-4 py-3 text-xs text-slate-600 align-top whitespace-nowrap">{getUsername(parsePerformer(item.description)?.email || item.performedBy) || "Unknown"}</td>
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
