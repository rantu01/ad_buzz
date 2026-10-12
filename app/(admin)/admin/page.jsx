"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "./components/AdminProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { hasPermission } from "@/lib/permissions";
import { formatMonthYear } from "@/lib/dateFormat";
import {
  Users,
  Megaphone,
  CircleCheck,
  Ban,
  Wallet,
  ArrowUpCircle,
  CalendarMinus,
  CalendarRange,
  User,
  ShieldCheck,
  KeyRound,
  Briefcase,
  CreditCard,
  Banknote,
  LifeBuoy,
  ChartColumn,
  Trophy,
  RefreshCw,
} from "lucide-react";

function formatMoney(val) {
  const n = Number(val || 0);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function formatInt(val) {
  return Number(val || 0).toLocaleString();
}

function formatPct(val) {
  const n = Number(val || 0);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "0.00%";
}

function monthLabel(year, month) {
  return formatMonthYear(year, month);
}

function SummaryCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={18} />
        </span>
        <p className="text-sm font-medium text-slate-500 leading-snug">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-3 tabular-nums break-words">{value}</p>
      {sub ? <p className="text-xs text-slate-400 mt-1">{sub}</p> : null}
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Loading summary cards">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          <div className="h-3 w-40 bg-slate-100 rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

function TopAccountsTable({ title, subtitle, rows, loading, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-4 border-b border-slate-100">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Icon size={17} className="text-slate-400" /> {title}
        </h3>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </div>
      {loading ? (
        <div className="p-4 space-y-3 animate-pulse" aria-label={`Loading ${title}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10 px-4">No top-up data found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">#</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Ad Account Name &amp; ID</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Total Top-Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={row.accountId || idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 tabular-nums w-10">{idx + 1}</td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="font-medium text-slate-800 break-words">{row.name || "—"}</div>
                    <div className="text-xs text-slate-400 font-mono">ID: {row.identifier || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums whitespace-nowrap">
                    ${formatMoney(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { profile, access, loading: adminLoading } = useAdmin();
  const settings = useSettings();
  const accent = settings?.secondaryColor || "#F48E2B";

  const role = profile?.role || "customer";
  const overrides = access?.permissions;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Single aggregated request (one HTTP call, parallel DB aggregations
  // server-side) — mirrors the async-IIFE fetch pattern used by the
  // Top-Up Insights page.
  useEffect(() => {
    if (adminLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/dashboard-summary", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || "Failed to load dashboard summary.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load dashboard summary.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminLoading, reloadKey]);

  const handleRefresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const can = (perm) => hasPermission(role, perm, overrides);
  const canUsers = can("view_users");
  const canAdAccounts = can("view_ad_accounts");
  const canTopup = can("view_topup_insights");
  const canPayments = can("view_payment_methods");
  const canDeposits = can("view_deposits") || can("approve_deposits");
  const canTickets = can("view_tickets") || can("manage_tickets");

  const s = data?.summary || null;
  const monthly = data?.monthly || [];
  const maxMonthlyAmount = Math.max(1, ...monthly.map((m) => Number(m.totalAmount || 0)));

  const cards = [];
  if (canUsers)
    cards.push({
      key: "clients",
      icon: Users,
      label: "Total Clients (Customers)",
      value: loading ? "…" : formatInt(s?.totalClients),
    });
  if (canAdAccounts) {
    cards.push(
      { key: "ad-total", icon: Megaphone, label: "Total Ad Accounts", value: loading ? "…" : formatInt(s?.totalAdAccounts) },
      { key: "ad-active", icon: CircleCheck, label: "Total Active Ad Accounts", value: loading ? "…" : formatInt(s?.activeAdAccounts) },
      { key: "ad-disabled", icon: Ban, label: "Total Disabled Ad Accounts", value: loading ? "…" : formatInt(s?.disabledAdAccounts) },
      { key: "meta-balance", icon: Wallet, label: "Total Meta Balance", value: loading ? "…" : `$${formatMoney(s?.totalMetaBalance)}`, sub: "Active ad accounts only" }
    );
  }
  if (canTopup) {
    cards.push(
      {
        key: "topup-lifetime",
        icon: ArrowUpCircle,
        label: "Total Top-Up Amount (Lifetime)",
        value: loading ? "…" : `$${formatMoney(s?.lifetimeTopUp)}`,
        sub: loading ? "" : `${formatInt(s?.lifetimeTopUpCount)} transactions`,
      },
      {
        key: "topup-last",
        icon: CalendarMinus,
        label: "Last Month's Top-Up Amount",
        value: loading ? "…" : `$${formatMoney(s?.lastMonthTopUp)}`,
        sub: loading ? "" : monthLabel(s?.lastMonth?.year, s?.lastMonth?.month),
      },
      {
        key: "topup-current",
        icon: CalendarRange,
        label: "Current Month's Top-Up Amount",
        value: loading ? "…" : `$${formatMoney(s?.currentMonthTopUp)}`,
        sub: loading ? "" : monthLabel(s?.currentMonth?.year, s?.currentMonth?.month),
      },
      {
        key: "topup-client",
        icon: User,
        label: "Lifetime Top-Up by Client",
        value: loading ? "…" : `$${formatMoney(s?.byRole?.client?.amount)}`,
        sub: loading ? "" : `${formatPct(s?.byRole?.client?.pct)} of lifetime top-up`,
      },
      {
        key: "topup-admin",
        icon: ShieldCheck,
        label: "Lifetime Top-Up by Admin",
        value: loading ? "…" : `$${formatMoney(s?.byRole?.admin?.amount)}`,
        sub: loading ? "" : `${formatPct(s?.byRole?.admin?.pct)} of lifetime top-up`,
      },
      {
        key: "topup-key",
        icon: KeyRound,
        label: "Lifetime Top-Up by Key Manager",
        value: loading ? "…" : `$${formatMoney(s?.byRole?.keyManager?.amount)}`,
        sub: loading ? "" : `${formatPct(s?.byRole?.keyManager?.pct)} of lifetime top-up`,
      },
      {
        key: "topup-am",
        icon: Briefcase,
        label: "Lifetime Top-Up by Account Manager",
        value: loading ? "…" : `$${formatMoney(s?.byRole?.accountManager?.amount)}`,
        sub: loading ? "" : `${formatPct(s?.byRole?.accountManager?.pct)} of lifetime top-up`,
      }
    );
  }
  if (canPayments)
    cards.push({
      key: "pay-methods",
      icon: CreditCard,
      label: "Total Number of Payment Methods",
      value: loading ? "…" : formatInt(s?.paymentMethodsCount),
    });
  if (canDeposits)
    cards.push({
      key: "deposits",
      icon: Banknote,
      label: "Total Approved Deposit Amount",
      value: loading ? "…" : `$${formatMoney(s?.approvedDeposits?.amount)}`,
      sub: loading ? "" : `${formatInt(s?.approvedDeposits?.count)} approved transactions`,
    });
  if (canTickets)
    cards.push({
      key: "tickets",
      icon: LifeBuoy,
      label: "Total Open Tickets",
      value: loading ? "…" : formatInt(s?.openTickets),
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mb-0">Real-time platform statistics and metrics</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50 shadow-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 mb-6">
            {error}{" "}
            <button type="button" onClick={handleRefresh} className="font-semibold underline">
              Retry
            </button>
          </div>
        ) : null}

        {loading && !data ? (
          <CardsSkeleton />
        ) : cards.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Your role does not have permission to view dashboard metrics.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading
              ? Array.from({ length: cards.length }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                    <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
                    <div className="h-3 w-40 bg-slate-100 rounded mt-2" />
                  </div>
                ))
              : cards.map((card) => (
                  <SummaryCard
                    key={card.key}
                    icon={card.icon}
                    label={card.label}
                    value={card.value}
                    sub={card.sub}
                    accent={accent}
                  />
                ))}
          </div>
        )}
      </div>

      {canTopup ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <ChartColumn size={18} className="text-slate-400" /> Top-Up Graph
            </h2>
            <span
              className="text-xs font-semibold text-white rounded-full px-3 py-1"
              style={{ backgroundColor: accent }}
            >
              Rolling last 12 months
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-5">Top-up amount (USD) per month — hover a bar for transactions &amp; amount.</p>
          {loading && !data ? (
            <div className="flex items-end gap-2 sm:gap-3 h-64" aria-label="Loading top-up chart">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex-1 h-full flex items-end">
                  <div
                    className="w-full rounded-t-md bg-slate-100 animate-pulse"
                    style={{ height: `${25 + ((i * 37) % 60)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : monthly.length === 0 || monthly.every((m) => Number(m.totalAmount || 0) === 0 && Number(m.total || 0) === 0) ? (
            <p className="text-sm text-slate-400 text-center py-16">No top-up data found for the last 12 months.</p>
          ) : (
            <div>
              <div className="flex items-end gap-2 sm:gap-3 h-64">
                {monthly.map((m, idx) => {
                  const pct = Math.max(0, Math.min(100, (Number(m.totalAmount || 0) / maxMonthlyAmount) * 100));
                  const hasValue = Number(m.totalAmount || 0) > 0;
                  const tipAlign =
                    idx <= 1 ? "left-0" : idx >= monthly.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
                  return (
                    <div key={m.key} className="relative flex-1 h-full flex flex-col items-center justify-end group">
                      <div
                        className={`absolute bottom-full mb-2 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-left shadow-lg ${tipAlign}`}
                      >
                        <p className="text-xs font-semibold text-white">
                          {formatMonthYear(m.year, m.month)}
                        </p>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Total Transactions:{" "}
                          <span className="font-semibold text-white">{formatInt(m.total)}</span>
                        </p>
                        <p className="text-xs text-slate-300">
                          Total Amount: <span className="font-semibold text-white">${formatMoney(m.totalAmount)}</span>
                        </p>
                      </div>
                      <div
                        className={`w-full rounded-t-md cursor-pointer transition hover:brightness-90 ${
                          hasValue ? "" : "bg-slate-100"
                        }`}
                        style={
                          hasValue
                            ? { backgroundColor: accent, height: `${Math.max(pct, 3)}%` }
                            : { height: "4px" }
                        }
                        title={`${formatMonthYear(m.year, m.month)}: ${formatInt(m.total)} transactions, $${formatMoney(
                          m.totalAmount
                        )}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 sm:gap-3 mt-2">
                {monthly.map((m) => (
                  <div key={m.key} className="flex-1 text-center min-w-0">
                    <p className="text-[10px] sm:text-xs font-medium text-slate-500 truncate">
                      {String(m.month).padStart(2, "0")}
                    </p>
                    <p className="text-[10px] text-slate-300">{String(m.year).slice(2)}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: accent }} /> Top-up
                  amount (USD)
                </span>
                <span className="text-xs font-medium text-slate-600">Peak: ${formatMoney(maxMonthlyAmount)}</span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {canTopup ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6 items-start">
          <TopAccountsTable
            title="Lifetime Top 30 Accounts"
            subtitle="Ranked by lifetime top-up amount (highest first)"
            rows={data?.topLifetime || []}
            loading={loading && !data}
            icon={Trophy}
          />
          <TopAccountsTable
            title={`Top 30 Ad Accounts (${monthLabel(s?.lastMonth?.year, s?.lastMonth?.month) || "Last Month"})`}
            subtitle="Ranked by previous calendar month top-up amount (highest first)"
            rows={data?.topLastMonth || []}
            loading={loading && !data}
            icon={Trophy}
          />
        </div>
      ) : null}
    </div>
  );
}
