"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, ChevronDown, LifeBuoy, Banknote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { useAdmin } from "./AdminProvider";
import { useTicketAlerts } from "./TicketAlertProvider";
import { useDepositAlerts } from "./DepositAlertProvider";
import { useNotifications } from "./NotificationProvider";
import NotificationBell from "@/app/Component/Notifications/NotificationBell";
import { formatDateTime } from "@/lib/dateFormat";
import { ROLE_LABELS } from "@/lib/rbacCatalog";

export default function DashboardTopbar({ onToggle }) {
    const router = useRouter();
    const { user, logout } = useAuth();
    const { profile, access } = useAdmin();
    const [avatarState, setAvatarState] = useState({ uid: null, url: "" });
    const avatarUrl = avatarState.uid === user?.uid ? avatarState.url : "";
    const settings = useSettings();
    const { canView } = useTicketAlerts();
    const { unread: notifUnread, items: notifItems, markRead: markNotifRead, markAllRead: markAllNotifRead, soundOn, toggleSound, refresh: refreshNotifs } = useNotifications();
    const { canView: canViewDeposits, pending: pendingDeposits, items: depositItems } = useDepositAlerts();
    const [depositOpen, setDepositOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const depositMenuRef = useRef(null);
    const depositTriggerRef = useRef(null);
    const accountMenuRef = useRef(null);
    const accountTriggerRef = useRef(null);
    const roleName = access?.roleLabels?.[profile?.role]
        || ROLE_LABELS[profile?.role]
        || String(profile?.role || "Staff").replace(/_/g, " ");
    const displayName = profile?.displayName || user?.displayName || user?.email || "Staff";

    // Show the admin's uploaded picture here too (same users.avatar field as
    // the profile page) and keep it live across tabs of the admin panel.
    useEffect(() => {
        if (!user?.uid) return;
        let active = true;
        const load = async () => {
            try {
                const res = await fetch(`/api/user/profile?uid=${encodeURIComponent(user.uid)}`);
                const data = await res.json();
                if (active && res.ok && data.success) setAvatarState({ uid: user.uid, url: data.user?.avatar || "" });
            } catch { /* avatar is cosmetic; never block the shell */ }
        };
        load();
        const onAvatarUpdated = (event) => {
            if (active) setAvatarState({ uid: user.uid, url: event.detail?.avatar || "" });
        };
        window.addEventListener("adbuzz:avatar-updated", onAvatarUpdated);
        return () => {
            active = false;
            window.removeEventListener("adbuzz:avatar-updated", onAvatarUpdated);
        };
    }, [user?.uid]);

    useEffect(() => {
        if (!depositOpen && !accountOpen) return undefined;
        const closeOnOutsidePointer = (event) => {
            if (depositOpen && !depositMenuRef.current?.contains(event.target)) setDepositOpen(false);
            if (accountOpen && !accountMenuRef.current?.contains(event.target)) setAccountOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key !== "Escape") return;
            if (accountOpen) {
                setAccountOpen(false);
                accountTriggerRef.current?.focus();
            }
            if (depositOpen) {
                setDepositOpen(false);
                depositTriggerRef.current?.focus();
            }
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [depositOpen, accountOpen]);

    const handleLogout = async () => {
        await logout();
        router.replace("/");
        router.refresh();
    };

    const openNotifications = () => {
        refreshNotifs();
    };

    const goToTicket = (n) => {
        // The exact ticket is always addressed by its notification refId
        // (the ticket's _id). Never fall back to the notification _id —
        // that would open the wrong ticket.
        const ticketDbId = n?.refType === "ticket" ? n?.refId : n?.ticketDbId;
        if (!ticketDbId) {
            if (n?.link) {
                markNotifRead(String(n._id));
                router.push(n.link);
            }
            return;
        }
        markNotifRead(String(n._id), { ticketDbId: String(ticketDbId) });
        try {
            if (typeof window !== "undefined") {
                window.sessionStorage.setItem("ab_open_ticket", String(ticketDbId));
            }
        } catch { /* navigation still works without deep-link */ }
        router.push("/admin/support-tickets");
    };

    const goToNotification = (n) => {
        if (!n) return;
        if (n.refType === "ticket" && n.refId) {
            goToTicket(n);
            return;
        }
        if (n.refType === "ad_account_request" && n.refId) {
            markNotifRead(String(n._id));
            try {
                if (typeof window !== "undefined") {
                    window.sessionStorage.setItem("ab_open_admin_ad_request", String(n.refId));
                }
            } catch { /* navigation still works */ }
            router.push(n.link || "/admin/ad-account-requests");
            return;
        }
        if (n.refType === "deposit" && n.refId) {
            markNotifRead(String(n._id));
            try {
                if (typeof window !== "undefined") {
                    window.sessionStorage.setItem("ab_open_deposit", String(n.refId));
                }
            } catch { /* navigation still works without deep-link */ }
            router.push("/admin/deposits");
            return;
        }
        markNotifRead(String(n._id));
        if (n.link) router.push(n.link);
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
                        <div className="relative" ref={depositMenuRef}>
                            <button
                                ref={depositTriggerRef}
                                type="button"
                                onClick={() => setDepositOpen((v) => !v)}
                                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5DED6] bg-white text-slate-600 shadow-sm transition hover:border-secondary hover:text-primary-700"
                                aria-label="Deposit request notifications"
                                aria-expanded={depositOpen}
                                aria-controls="admin-deposit-menu"
                            >
                                <Banknote size={20} />
                                {pendingDeposits > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                                        {pendingDeposits > 99 ? "99+" : pendingDeposits}
                                    </span>
                                )}
                            </button>
                            {depositOpen && (
                                    <div id="admin-deposit-menu" className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#E5DED6] bg-white shadow-xl">
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
                                                            {d.transactionRef ? `Trx: ${d.transactionRef} · ` : ""}{formatDateTime(d.createdAt)}
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
                            )}
                        </div>
                    )}
                    {canView && (
                        <NotificationBell
                            unread={notifUnread}
                            items={notifItems}
                            title="Notifications"
                            subtitle="Ticket replies, stage changes & deposit updates"
                            emptyText="No new notifications."
                            viewAllLabel="View all notifications"
                            onOpen={openNotifications}
                            onSelect={goToNotification}
                            onViewAll={() => router.push("/admin/notifications")}
                            onMarkAllRead={markAllNotifRead}
                            soundOn={soundOn}
                            onToggleSound={toggleSound}
                            accentClass="bg-amber-100 text-amber-700"
                            icon={<LifeBuoy size={16} />}
                        />
                    )}
                    <div className="relative" ref={accountMenuRef}>
                        <button
                            ref={accountTriggerRef}
                            type="button"
                            onClick={() => setAccountOpen((open) => !open)}
                            className="flex items-center gap-3 rounded-2xl border border-[#E5DED6] bg-white px-3 py-2 text-left shadow-sm hover:border-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                            aria-expanded={accountOpen}
                            aria-haspopup="true"
                            aria-controls="admin-account-menu"
                        >
                            {avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatarUrl} alt="Profile" className="h-9 w-9 rounded-xl border border-slate-200 object-cover" />
                            ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
                                    style={{ background: `linear-gradient(135deg, ${settings?.primaryColor || "#135B9A"}, ${settings?.secondaryColor || "#F48E2B"})` }}>
                                    AB
                                </div>
                            )}
                            <div className="hidden sm:block">
                                <p className="max-w-36 truncate text-sm font-semibold text-slate-900">{displayName}</p>
                                <p className="text-xs text-slate-500">{roleName}</p>
                            </div>
                            <ChevronDown size={16} className="text-slate-400" />
                        </button>
                        {accountOpen && (
                            <div id="admin-account-menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-[#E5DED6] bg-white shadow-xl">
                                <div className="border-b border-slate-100 px-4 py-3">
                                    <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                                    <p className="truncate text-xs text-slate-500">{profile?.email || user?.email || ""}</p>
                                    <p className="mt-1 text-xs font-medium text-slate-600">{roleName}</p>
                                </div>
                                <Link href="/admin/profile" onClick={() => setAccountOpen(false)} className="block px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">My profile</Link>
                                <Link href="/admin" onClick={() => setAccountOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">Dashboard</Link>
                                <button type="button" onClick={handleLogout} className="w-full border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-red-700 hover:bg-red-50">Sign out</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
