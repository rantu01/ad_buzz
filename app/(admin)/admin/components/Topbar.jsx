"use client";

import { useState } from "react";
import { Menu, ChevronDown, Bell, LifeBuoy, Banknote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { useTicketAlerts } from "./TicketAlertProvider";
import { useDepositAlerts } from "./DepositAlertProvider";

export default function DashboardTopbar({ onToggle }) {
    const router = useRouter();
    const { logout } = useAuth();
    const settings = useSettings();
    const logo = settings?.logo || "/logo.jpeg";
    const { canView, items, unread, markAllRead, markRead } = useTicketAlerts();
    const { canView: canViewDeposits, pending: pendingDeposits, items: depositItems } = useDepositAlerts();
    const [notifOpen, setNotifOpen] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        router.replace("/");
        router.refresh();
    };

    const openNotifications = () => {
        const willOpen = !notifOpen;
        setNotifOpen(willOpen);
        // Opening the panel marks everything currently unread as seen for
        // this admin (server-persisted). The badge drops to 0 at once.
        if (willOpen && unread > 0) markAllRead();
    };

    const goToTicket = (n) => {
        if (n?.ticketDbId || n?._id) markRead(String(n.ticketDbId || n._id));
        try {
            const id = n?.ticketDbId || n?._id;
            if (id && typeof window !== "undefined") {
                window.sessionStorage.setItem("ab_open_ticket", String(id));
            }
        } catch { /* navigation still works without deep-link */ }
        setNotifOpen(false);
        router.push("/admin/support-tickets");
    };

    const goToDeposit = (d) => {
        try {
            if (d?._id && typeof window !== "undefined") {
                window.sessionStorage.setItem("ab_open_deposit", String(d._id));
            }
        } catch { /* navigation still works without deep-link */ }
        setDepositOpen(false);
        router.push("/admin/deposits");
    };

    return (
        <header className="sticky top-0 z-20 border-b border-[#E5DED6] bg-white/90 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        onClick={onToggle}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5DED6] bg-white text-slate-700 shadow-sm transition hover:border-secondary hover:text-primary-700 lg:hidden"
                        aria-label="Toggle sidebar"
                    >
                        <Menu size={20} />
                    </button>

                    <div className="flex items-center gap-3">
                        
                        {/* <img src={logo} alt="Ad Buzz" className="h-8 w-auto hidden sm:block" /> */}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">Dashboard</p>
                            <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">{settings?.siteName || "Ad Buzz"} Control Center</h1>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
                    {canViewDeposits && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setDepositOpen((v) => !v)}
                                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5DED6] bg-white text-slate-600 shadow-sm transition hover:border-secondary hover:text-primary-700"
                                aria-label="Deposit request notifications"
                            >
                                <Banknote size={20} />
                                {pendingDeposits > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                                        {pendingDeposits > 99 ? "99+" : pendingDeposits}
                                    </span>
                                )}
                            </button>
                            {depositOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setDepositOpen(false)} />
                                    <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#E5DED6] bg-white shadow-xl">
                                        <div className="border-b border-slate-100 px-4 py-3">
                                            <p className="text-sm font-semibold text-slate-900">Deposit requests</p>
                                            <p className="text-xs text-slate-500">New deposit requests awaiting review</p>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            {depositItems.length === 0 ? (
                                                <p className="px-4 py-8 text-center text-sm text-slate-400">No pending deposits.</p>
                                            ) : depositItems.map((d) => (
                                                <button
                                                    key={String(d._id)}
                                                    type="button"
                                                    onClick={() => goToDeposit(d)}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                                                >
                                                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                                                        <Banknote size={16} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-semibold text-slate-900">
                                                            ${Number(d.creditedUSD || d.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            <span className="ml-1 font-normal text-slate-500">from {d.email || "user"}</span>
                                                        </span>
                                                        <span className="block truncate text-xs text-slate-500">
                                                            {d.transactionRef ? `Trx: ${d.transactionRef} · ` : ""}{new Date(d.createdAt).toLocaleString()}
                                                        </span>
                                                    </span>
                                                    <span className="mt-1 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                                        Pending
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setDepositOpen(false); router.push("/admin/deposits"); }}
                                            className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                        >
                                            View all deposits
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {canView && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={openNotifications}
                                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5DED6] bg-white text-slate-600 shadow-sm transition hover:border-secondary hover:text-primary-700"
                                aria-label="Support ticket notifications"
                            >
                                <Bell size={20} />
                                {unread > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                                        {unread > 99 ? "99+" : unread}
                                    </span>
                                )}
                            </button>
                            {notifOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                                    <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#E5DED6] bg-white shadow-xl">
                                        <div className="border-b border-slate-100 px-4 py-3">
                                            <p className="text-sm font-semibold text-slate-900">Support ticket alerts</p>
                                            <p className="text-xs text-slate-500">New tickets created by users</p>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            {items.length === 0 ? (
                                                <p className="px-4 py-8 text-center text-sm text-slate-400">No new notifications.</p>
                                            ) : items.map((n) => (
                                                <button
                                                    key={String(n._id)}
                                                    type="button"
                                                    onClick={() => goToTicket(n)}
                                                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                                                >
                                                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                                                        <LifeBuoy size={16} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-semibold text-slate-900">{n.subject}</span>
                                                        <span className="block truncate text-xs text-slate-500">
                                                            {n.ticketId ? `Ticket Id: ${n.ticketId} · ` : ""}{n.email}
                                                        </span>
                                                        <span className="block text-[11px] text-slate-400">
                                                            {new Date(n.createdAt).toLocaleString()}
                                                        </span>
                                                    </span>
                                                    <span className="mt-1 shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                                                        New
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setNotifOpen(false); router.push("/admin/support-tickets"); }}
                                            className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                        >
                                            View all tickets
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-3 rounded-2xl border border-[#E5DED6] bg-white px-3 py-2 shadow-sm">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
                            style={{ background: `linear-gradient(135deg, ${settings?.primaryColor || "#135B9A"}, ${settings?.secondaryColor || "#F48E2B"})` }}>
                            AB
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-sm font-semibold text-slate-900">Admin</p>
                            <p className="text-xs text-slate-500">Operations lead</p>
                        </div>
                        <ChevronDown size={16} className="text-slate-400" />
                    </div>

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
}
