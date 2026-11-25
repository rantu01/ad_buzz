"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Swal from "sweetalert2";
import {
  CircleHelp,
  Eye,
  History,
  Link2,
  Megaphone,
  MoreVertical,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import useSSE from "@/app/Component/Hooks/useSSE";
import useAdAccountRealtime from "@/app/Component/Hooks/useAdAccountRealtime";
import { formatDateTime } from "@/lib/dateFormat";
import NewTicketModal from "@/app/user-dashboard/support-tickets/NewTicketModal";

const MENU_WIDTH = 224;
const MENU_HEIGHT = 310;

function MenuItem({ icon: Icon, iconClassName, children, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
    >
      <Icon size={16} strokeWidth={2} className={`shrink-0 ${iconClassName || "text-slate-500"}`} />
      <span>{children}</span>
    </button>
  );
}

function DetailRow({ label, value, mono = false, className = "" }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-sm text-slate-900 ${mono ? "font-mono" : ""} ${className}`}>{value ?? "—"}</p>
    </div>
  );
}

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

export default function AdAccountPage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const uid = user?.uid;

  const settings = useSettings();
  const defaultDollarRate = settings?.dollarRate || 129;

  const [topUpModal, setTopUpModal] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState("");

  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const [detailsModal, setDetailsModal] = useState(null);
  const [ticketModal, setTicketModal] = useState(null);

  const [historyModal, setHistoryModal] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const adAccountsQuery = useQuery({
    queryKey: ["user", "ad-accounts", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/ad-accounts?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load ad accounts");
      return data.adAccounts || [];
    },
    enabled: Boolean(uid),
    // Realtime updates arrive via SSE row-level patches (useAdAccountRealtime).
  });
  const adAccounts = adAccountsQuery.data || [];
  const isLoading = authLoading || !uid;

  const dashboardQuery = useQuery({
    queryKey: ["user", "dashboard", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/dashboard?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!data.success) throw new Error("Failed to load dashboard");
      return data.dashboard;
    },
    enabled: Boolean(uid),
  });
  const dashboard = dashboardQuery.data;
  const walletBalance = Number(dashboard?.availableBalance || 0);
  const userDollarRate = dashboard?.dollarRate || null;
  const effectiveRate = userDollarRate || defaultDollarRate;

  const { syncing: metaSyncing, syncError: metaSyncError } = useAdAccountRealtime({
    uid,
    queryClient,
    queryKey: ["user", "ad-accounts", uid],
  });

  useSSE({
    uid,
    onEvent: (type) => {
      if (type === "balance") {
        queryClient.invalidateQueries({ queryKey: ["user", "dashboard", uid] });
      }
    },
  });

  let error = "";
  if (adAccountsQuery.isError) error = adAccountsQuery.error.message;

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
    const close = () => setOpenMenuId(null);
    const handleClick = (e) => {
      if (!e.target.closest('[data-menu]')) close();
    };
    document.addEventListener("click", handleClick);
    // The menu is portalled to <body> so it escapes the table's overflow;
    // keep it anchored to the trigger while the page or table scrolls.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenuId]);

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
    if (amount > walletBalance) {
      setTopUpError(`Insufficient balance. Wallet: $${formatMoney(walletBalance)}`);
      return;
    }
    setTopUpLoading(true);
    setTopUpError("");
    try {
      const res = await fetch("/api/user/ad-accounts/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, accountId: topUpModal._id, amount }),
      });
      const data = await res.json();
      if (data.success) {
        setTopUpModal(null);
        queryClient.invalidateQueries({ queryKey: ["user", "ad-accounts", uid] });
        queryClient.invalidateQueries({ queryKey: ["user", "dashboard", uid] });
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

  const closeMenu = () => setOpenMenuId(null);

  const toggleMenu = (event, account) => {
    if (openMenuId === account._id) {
      closeMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    let top = rect.bottom + 6;
    if (top + MENU_HEIGHT > window.innerHeight) {
      top = Math.max(8, rect.top - MENU_HEIGHT - 6);
    }
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setMenuPos({ top, left });
    setOpenMenuId(account._id);
  };

  // Campaigns and BM access have no implementation yet — keep them clickable.
  const showComingSoon = (title) => {
    Swal.fire({
      icon: "info",
      title,
      text: "This action will be available soon.",
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleRefresh = async (account) => {
    try {
      const res = await fetch("/api/user/ad-accounts/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, accountId: account._id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Refresh failed");
      queryClient.invalidateQueries({ queryKey: ["user", "ad-accounts", uid] });
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Refresh from Meta queued",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire("Refresh failed", err.message || "Something went wrong.", "error");
    }
  };

  const handleRename = async (account) => {
    const currentName = account.displayName || account.metaAccountName || account.name || "";
    const { isConfirmed, value } = await Swal.fire({
      title: "Rename ad account",
      input: "text",
      inputValue: currentName,
      inputPlaceholder: "Enter a new name",
      showCancelButton: true,
      confirmButtonText: "Save",
      confirmButtonColor: "#ea580c",
      inputValidator: (v) => (!v || !v.trim() ? "Please enter a name." : null),
    });
    if (!isConfirmed) return;

    const name = String(value).trim();
    try {
      const res = await fetch("/api/user/ad-accounts/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, accountId: account._id, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Rename failed");
      queryClient.setQueryData(["user", "ad-accounts", uid], (old) =>
        Array.isArray(old)
          ? old.map((a) => (a._id === account._id ? { ...a, name, metaAccountName: name, displayName: name } : a))
          : old
      );
      queryClient.invalidateQueries({ queryKey: ["user", "ad-accounts", uid] });
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Ad account renamed",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire("Rename failed", err.message || "Something went wrong.", "error");
    }
  };

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading ad accounts...</div>;

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

  const menuAccount = adAccounts.find((a) => a._id === openMenuId) || null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Ad Accounts</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Your Ad Accounts</h1>
        {metaSyncing && <p className="text-xs text-blue-600 mt-2">Syncing the latest Meta account data...</p>}
        {!metaSyncing && metaSyncError && <p className="text-xs text-amber-700 mt-2">Meta sync could not complete. Showing the last successful sync.</p>}
        <p className="text-sm text-slate-600 mt-1">Manage and top up your Meta ad accounts.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet Balance</span>
              <span className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">${formatMoney(walletBalance)}</div>
          </div>
          <div className="mt-4 text-xs font-medium text-blue-600 bg-blue-50/50 py-1.5 px-3 rounded-md w-max">Available for top-up</div>
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

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Remaining Balance</span>
              <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-4">${formatMoney(totalBudget - totalSpent)}</div>
          </div>
          {/* <div className="mt-4 text-xs font-medium text-emerald-600 bg-emerald-50/50 py-1.5 px-3 rounded-md w-max">${formatMoney(totalSpent)} Spent</div> */}
          <div className="mt-4 text-xs font-medium text-emerald-600 bg-emerald-50/50 py-1.5 px-3 rounded-md w-max">Balance</div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-amber-500/30 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-5 -mt-5"></div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Conversion Rate</span>
              <span className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-4 whitespace-nowrap">{effectiveRate} BDT = 1 USD</div>
          </div>
          <div className="mt-4 text-xs font-semibold text-amber-700 bg-amber-50 py-1.5 px-3 rounded-md w-max">Exchange Rate</div>
        </div>
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
                    {/* <th className="pb-3 pr-4">Spent</th> */}
                    {/* <th className="pb-3 pr-4">Meta Balance</th> */}
                    <th className="pb-3 pr-4">Last Refreshed</th>
                    <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {adAccounts.map((acc) => {
                const budgetNum = Number(acc.metaSpendCap ?? acc.spendCap ?? 0);
                const spentNum = acc.metaStatus != null ? Number(acc.metaAmountSpent ?? 0) : Number(acc.spent || 0);
                const remaining = acc.remainingBalance;
                const spendPct = budgetNum > 0 ? Math.min((spentNum / budgetNum) * 100, 100) : 0;
                const metaBalanceDollars = Number(acc.metaBalance || 0);
                return (
                  <tr key={acc._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 pr-4 font-medium text-slate-900 max-w-[220px] truncate" title={acc.displayName || acc.metaAccountName || acc.name}>
                      {acc.displayName || acc.metaAccountName || acc.name}
                    </td>
                    <td className="py-4 pr-4 font-mono text-xs text-blue-600">ID: {(acc.metaAccountId || acc.accountId || "").replace(/^act_/, "")}</td>
                    <td className="py-4 pr-4">
                      {getStatusBadge(acc.status, acc.metaStatusLabel)}
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-semibold text-slate-900">{remaining == null ? "N/A" : `${acc.currency || "USD"} $${formatMoney(remaining)}`} </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${spendPct > 90 ? "bg-red-500" : spendPct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${spendPct}%` }}></div>
                        </div>
                        {/* <span className="text-xs text-slate-500">$${formatMoney(spentNum)} spent</span> */}
                      </div>
                    </td>
                    {/* <td className="py-4 pr-4 text-sm">${formatMoney(spentNum)}</td> */}
                    {/* <td className="py-4 pr-4 text-sm font-medium text-slate-900">${formatMoney(metaBalanceDollars)}</td> */}
                    <td className="py-4 pr-4 text-xs text-slate-400" title={acc.lastSyncedAt ? formatDateTime(acc.lastSyncedAt) : ""}>
                      <span className="flex items-center gap-1">
                        {metaSyncing ? "Syncing..." : acc.lastSyncedAt ? timeAgo(acc.lastSyncedAt) : (adAccountsQuery.dataUpdatedAt ? "Cached" : "Loading...")}
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
                        <div className="relative" data-menu>
                          <button
                            type="button"
                            aria-label={`Actions for ${acc.displayName || acc.metaAccountName || acc.name}`}
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === acc._id}
                            onClick={(e) => toggleMenu(e, acc)}
                            className="inline-flex items-center justify-center p-1.5 text-slate-400 rounded-lg hover:text-slate-600 hover:bg-slate-100 transition"
                          >
                            <MoreVertical size={18} />
                          </button>
                        </div>
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
                  <span className="text-slate-500">Wallet Balance</span>
                  <span className="text-blue-600 font-semibold">${formatMoney(walletBalance)}</span>
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
                const newWallet = walletBalance - amt;
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
                    {/* <div className="flex justify-between text-sm border-t border-blue-200 pt-2">
                      <span className="text-slate-600">Wallet Balance</span>
                      <span className="text-slate-800 font-medium">${formatMoney(walletBalance)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">After Top-Up</span>
                      <span className={newWallet >= 0 ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>${formatMoney(newWallet)}</span>
                    </div> */}
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
                          <td className="py-3 pr-4 text-xs text-slate-500">{formatDateTime(h.date)}</td>
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

      {openMenuId && menuAccount && createPortal(
        <div
          data-menu
          role="menu"
          aria-label="Ad account actions"
          className="fixed z-[60] w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <MenuItem
            icon={Eye}
            iconClassName="text-sky-500"
            onClick={() => { closeMenu(); setDetailsModal(menuAccount); }}
          >
            View Details
          </MenuItem>
          <MenuItem
            icon={Megaphone}
            iconClassName="text-purple-600"
            onClick={() => { closeMenu(); showComingSoon("Campaigns"); }}
          >
            Campaigns
          </MenuItem>
          <MenuItem
            icon={History}
            iconClassName="text-amber-500"
            onClick={() => { closeMenu(); openHistory(menuAccount); }}
          >
            Top-up history
          </MenuItem>

          <div className="my-1 border-t border-slate-100" role="separator" />

          <MenuItem
            icon={RefreshCw}
            iconClassName="text-blue-500"
            onClick={() => { closeMenu(); handleRefresh(menuAccount); }}
          >
            Refresh from Meta
          </MenuItem>

          <div className="my-1 border-t border-slate-100" role="separator" />

          <MenuItem
            icon={Link2}
            iconClassName="text-sky-500"
            onClick={() => { closeMenu(); showComingSoon("BM access"); }}
          >
            BM access
          </MenuItem>
          {/* <MenuItem
            icon={Pencil}
            iconClassName="text-slate-500"
            onClick={() => { closeMenu(); handleRename(menuAccount); }}
          >
            Rename
          </MenuItem> */}
          <MenuItem
            icon={CircleHelp}
            iconClassName="text-slate-600"
            onClick={() => { closeMenu(); setTicketModal(menuAccount); }}
          >
            Support ticket
          </MenuItem>
        </div>,
        document.body
      )}

      {detailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Ad Account Details</h2>
                <p className="text-sm text-slate-500 mt-0.5">{detailsModal.displayName || detailsModal.metaAccountName || detailsModal.name}</p>
              </div>
              <button
                onClick={() => setDetailsModal(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-sm text-slate-500">Meta status</span>
                {getStatusBadge(detailsModal.status, detailsModal.metaStatusLabel)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <DetailRow label="Meta Account ID" value={detailsModal.metaAccountId || detailsModal.accountId || "—"} mono className="break-all" />
                <DetailRow label="Currency" value={detailsModal.currency || "USD"} />
                <DetailRow
                  label="Remaining balance"
                  value={detailsModal.remainingBalance == null ? "N/A" : `${detailsModal.currency || "USD"} $${formatMoney(detailsModal.remainingBalance)}`}
                  className="font-semibold"
                />
                <DetailRow label="Spend cap" value={`$${formatMoney(detailsModal.metaSpendCap ?? detailsModal.spendCap ?? 0)}`} />
                <DetailRow label="Amount spent" value={`$${formatMoney(detailsModal.metaAmountSpent ?? detailsModal.spent ?? 0)}`} />
                <DetailRow label="Meta balance" value={detailsModal.metaBalance == null ? "N/A" : `$${formatMoney(detailsModal.metaBalance)}`} />
                <DetailRow label="Prepaid balance" value={detailsModal.prepaidBalance == null ? "N/A" : `$${formatMoney(detailsModal.prepaidBalance)}`} />
                <DetailRow label="Last refreshed" value={detailsModal.lastSyncedAt ? formatDateTime(detailsModal.lastSyncedAt) : "—"} />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
              <button
                onClick={() => setDetailsModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <NewTicketModal
        open={Boolean(ticketModal)}
        onClose={() => setTicketModal(null)}
        user={user}
        adAccounts={adAccounts}
        initialAccountId={ticketModal?._id || null}
      />
    </div>
  );
}
