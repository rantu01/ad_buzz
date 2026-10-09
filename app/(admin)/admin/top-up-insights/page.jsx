"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../components/AdminProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { ROLES, ROLE_LABELS, PERMISSIONS, hasPermission } from "@/lib/permissions";
import Pagination from "@/app/Component/Pagination";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, ChartColumn, Table } from "lucide-react";

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

function formatCompact(val) {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n)}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  const { profile, access, loading: profileLoading } = useAdmin();
  const settings = useSettings();
  // Sidebar theme accent (active-item highlight); bars match the sidebar.
  const accent = settings?.secondaryColor || "#F48E2B";

  const role = profile?.role;
  const canView = hasPermission(role, PERMISSIONS.VIEW_TOPUP_INSIGHTS, access?.permissions);
  const isAdmin = role === ROLES.ADMIN;

  const today = new Date();

  const [selectedDay, setSelectedDay] = useState(() => startOfDay(today));
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(today));
  const [tableView, setTableView] = useState("day");
  const [page, setPage] = useState(1);
  const [datePage, setDatePage] = useState(1);

  const [overall, setOverall] = useState({ total: 0, totalAmount: 0 });
  const [yearStats, setYearStats] = useState({ total: 0, totalAmount: 0 });
  const [monthlyData, setMonthlyData] = useState([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
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

  // Lifetime + rolling-12-month stats come from one aggregation request
  // (no document download); day/month tables fetch their ranges separately.
  useEffect(() => {
    if (profileLoading) return;
    if (!canView) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/top-up-insights?uid=all&breakdown=monthly&months=12`);
        const data = await res.json();
        if (data.success) {
          setMonthlyData(data.monthly || []);
          setYearStats({ total: data.yearTotal || 0, totalAmount: data.yearAmount || 0 });
          setOverall({ total: data.lifetimeTotal || 0, totalAmount: data.lifetimeAmount || 0 });
        }
      } catch {
        // Keep defaults on failure; boxes still render.
      } finally {
        setMonthlyLoading(false);
        setLoading(false);
      }
    })();
  }, [profileLoading, canView]);

  useEffect(() => {
    if (profileLoading) return;
    if (!canView) return;
    const from = startOfDay(selectedDay);
    const to = addDays(from, 1);
    (async () => {
      const res = await fetchInsights({ uid: "all", from: from.toISOString(), to: to.toISOString() });
      setDayItems(res.insights || []);
    })();
  }, [profileLoading, canView, fetchInsights, selectedDay]);

  useEffect(() => {
    if (profileLoading) return;
    if (!canView) return;
    const from = startOfMonth(selectedMonth);
    const to = addMonths(from, 1);
    (async () => {
      const res = await fetchInsights({ uid: "all", from: from.toISOString(), to: to.toISOString() });
      setMonthItems(res.insights || []);
    })();
  }, [profileLoading, canView, fetchInsights, selectedMonth]);

  if (profileLoading || loading) {
    // When access is denied there is nothing to load — stop the spinner.
    if (!profileLoading && !canView) {
      return <p className="text-slate-500">Your role does not have permission to access this page.</p>;
    }
    return <p className="text-slate-500">Loading insights...</p>;
  }

  if (!canView) {
    return <p className="text-slate-500">Your role does not have permission to access this page.</p>;
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

  // Date-wise breakdown of the selected month: one row per calendar day with
  // transaction counts, total amount, and per-role top-up amounts.
  const itemsByDayOfMonth = {};
  for (const item of monthItems) {
    const d = new Date(item.createdAt);
    const day = d.getDate();
    if (!itemsByDayOfMonth[day]) itemsByDayOfMonth[day] = [];
    itemsByDayOfMonth[day].push(item);
  }
  const daysInSelectedMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const dateRows = [];
  for (let day = 1; day <= daysInSelectedMonth; day++) {
    const bucket = itemsByDayOfMonth[day] || [];
    const stats = computeStats(bucket);
    dateRows.push({
      day,
      date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day),
      count: bucket.length,
      amount: bucket.reduce((s, i) => s + Number(i.amount || 0), 0),
      admin: stats.admin?.amount || 0,
      keyManager: stats.key_manager?.amount || 0,
      accountsManager: stats.accounts_manager?.amount || 0,
    });
  }

  const currentYear = today.getFullYear();
  const maxMonthlyAmount = Math.max(1, ...monthlyData.map((m) => Number(m.totalAmount || 0)));

  // Average Daily Sell = month total ÷ (entry days − 1), where entry days
  // counts only days with recorded top-ups in the selected month.
  const entryDays = dateRows.filter((r) => r.count > 0).length;
  const avgDailySell = entryDays > 1 ? monthAmount / (entryDays - 1) : null;

  const dateTotalPages = Math.max(1, Math.ceil(dateRows.length / ITEMS_PER_PAGE));
  const safeDatePage = Math.min(Math.max(1, datePage), dateTotalPages);
  const paginatedDateRows = dateRows.slice((safeDatePage - 1) * ITEMS_PER_PAGE, safeDatePage * ITEMS_PER_PAGE);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Lifetime Total Transactions" value={overall.total.toLocaleString()} />
        <StatCard label="Lifetime Total Topup (USD)" value={`$${formatMoney(overall.totalAmount)}`} />
        <StatCard label="This Year Total Transactions" value={yearStats.total.toLocaleString()} sub={`${currentYear}`} />
        <StatCard label="This Year Total Topup (USD)" value={`$${formatMoney(yearStats.totalAmount)}`} sub={`${currentYear}`} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <ChartColumn size={18} className="text-slate-400" /> Monthly Top-Up Insights
          </h2>
          <span className="text-xs font-semibold text-white rounded-full px-3 py-1" style={{ backgroundColor: accent }}>Rolling last 12 months</span>
        </div>
        <p className="text-xs text-slate-400 mb-5">Top-up amount (USD) per month — hover a bar for transactions &amp; amount.</p>
        {monthlyLoading ? (
          <div className="flex items-end gap-2 sm:gap-3 h-64" aria-label="Loading monthly chart">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex-1 h-full flex items-end">
                <div className="w-full rounded-t-md bg-slate-100 animate-pulse" style={{ height: `${25 + ((i * 37) % 60)}%` }} />
              </div>
            ))}
          </div>
        ) : monthlyData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">No top-up data found for the last 12 months.</p>
        ) : (
          <div>
            <div className="flex items-end gap-2 sm:gap-3 h-64">
              {monthlyData.map((m, idx) => {
                const pct = Math.max(0, Math.min(100, (Number(m.totalAmount || 0) / maxMonthlyAmount) * 100));
                const hasValue = Number(m.totalAmount || 0) > 0;
                const tipAlign = idx <= 1 ? "left-0" : idx >= monthlyData.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div key={m.key} className="relative flex-1 h-full flex flex-col items-center justify-end group">
                    <div className={`absolute bottom-full mb-2 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-left shadow-lg ${tipAlign}`}>
                      <p className="text-xs font-semibold text-white">{MONTH_SHORT[m.month - 1]} {m.year}</p>
                      <p className="text-xs text-slate-300 mt-0.5">Total Transactions: <span className="font-semibold text-white">{Number(m.total || 0).toLocaleString()}</span></p>
                      <p className="text-xs text-slate-300">Total Amount: <span className="font-semibold text-white">${formatMoney(m.totalAmount)}</span></p>
                    </div>
                    <div
                      className={`w-full rounded-t-md cursor-pointer transition hover:brightness-90 ${hasValue ? "" : "bg-slate-100"}`}
                      style={hasValue ? { backgroundColor: accent, height: `${Math.max(pct, 3)}%` } : { height: "4px" }}
                      title={`${MONTH_SHORT[m.month - 1]} ${m.year}: ${Number(m.total || 0)} transactions, $${formatMoney(m.totalAmount)}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 sm:gap-3 mt-2">
              {monthlyData.map((m) => (
                <div key={m.key} className="flex-1 text-center min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-slate-500 truncate">{MONTH_SHORT[m.month - 1]}</p>
                  <p className="text-[10px] text-slate-300">{String(m.year).slice(2)}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: accent }} /> Top-up amount (USD)
              </span>
              <span className="text-xs font-medium text-slate-600">Peak: ${formatMoney(maxMonthlyAmount)}</span>
            </div>
          </div>
        )}
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
            <button onClick={() => { setSelectedMonth((m) => addMonths(m, -1)); setPage(1); setDatePage(1); }} className="border border-slate-200 text-slate-600 rounded-lg p-2 hover:bg-slate-50 transition">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[180px] text-center">{fmtMonth(selectedMonth)}</span>
            <button onClick={() => { if (canNextMonth) { setSelectedMonth((m) => addMonths(m, 1)); setPage(1); setDatePage(1); } }} disabled={!canNextMonth} className="border border-slate-200 text-slate-600 rounded-lg p-2 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <StatCard
            label="Average Daily Sell"
            value={avgDailySell === null ? "—" : `$${formatMoney(avgDailySell)}`}
            sub={entryDays > 1 ? `${entryDays} active days` : entryDays === 1 ? "1 active day — needs 2+" : "No active days"}
          />
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Table size={18} className="text-slate-400" /> Date-wise Transaction Summary
          </h2>
          <p className="text-xs text-slate-400 mt-1">Day-by-day breakdown for {fmtMonth(selectedMonth)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Total Transactions</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Topup Amount</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Topup By Admin</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Topup By Key Manager</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Topup By Account Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDateRows.map((row) => (
                  <tr key={row.day} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{row.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                      <div className="text-xs text-slate-400">{row.date.toLocaleDateString(undefined, { weekday: "long" })}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{row.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium tabular-nums whitespace-nowrap">${formatMoney(row.amount)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums whitespace-nowrap">${formatMoney(row.admin)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums whitespace-nowrap">${formatMoney(row.keyManager)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums whitespace-nowrap">${formatMoney(row.accountsManager)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                  <td className="px-4 py-3 text-slate-800 whitespace-nowrap">Total ({fmtMonth(selectedMonth)})</td>
                  <td className="px-4 py-3 text-right text-slate-800 tabular-nums">{monthItems.length.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 tabular-nums whitespace-nowrap">${formatMoney(monthAmount)}</td>
                  <td className="px-4 py-3 text-right text-slate-800 tabular-nums whitespace-nowrap">${formatMoney(monthStats.admin?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-800 tabular-nums whitespace-nowrap">${formatMoney(monthStats.key_manager?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-800 tabular-nums whitespace-nowrap">${formatMoney(monthStats.accounts_manager?.amount || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <Pagination page={safeDatePage} totalPages={dateTotalPages} onPageChange={setDatePage} />
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
