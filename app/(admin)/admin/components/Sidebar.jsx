"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, X, DollarSign, History, Megaphone, RefreshCw, MessageSquare, BarChart3, Settings } from "lucide-react";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";

const navigation = [
    { label: "Overview", href: "/admin", icon: LayoutGrid },
    { label: "User Management", href: "/admin/user-management", icon: Users },
    { label: "Deposit Verification", href: "/admin/deposits", icon: DollarSign },
    { label: "Balance Logs", href: "/admin/balance-logs", icon: History },
    { label: "Ad Accounts", href: "/admin/ad-accounts", icon: Megaphone },
    { label: "Reports", href: "/admin/reports", icon: BarChart3 },
    { label: "Meta API", href: "/admin/meta-api", icon: RefreshCw },
    { label: "WhatsApp", href: "/admin/whatsapp", icon: MessageSquare },
];

export default function DashboardSidebar({ open, onClose }) {
    const pathname = usePathname();
    const settings = useSettings();
    const logo = settings?.logo || "/logo.jpeg";
    const primary = settings?.primaryColor || "#135B9A";
    const secondary = settings?.secondaryColor || "#F48E2B";

    return (
        <>
            <div
                className={`fixed inset-0 z-30 bg-slate-950/50 transition-opacity duration-200 lg:hidden ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            />

            <aside
                className={`fixed left-0 top-0 z-40 flex h-full w-72 flex-col border-r border-white/10 bg-gradient-to-b from-[#101828] via-[#0F172A] to-[#111827] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                    <Link href="/admin" className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo} alt="Ad Buzz" className="h-8 w-auto" />
                        {/* <div>
                            <p className="text-xs uppercase tracking-[0.35em]" style={{ color: secondary }}>{settings?.siteName || "Ad Buzz"}</p>
                            <h2 className="mt-1 text-xl font-semibold">Dashboard</h2>
                        </div> */}
                    </Link>
                    <button onClick={onClose} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close sidebar"><X size={18} /></button>
                </div>

                <div className="px-6 py-5">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur" style={{ borderColor: `${secondary}33` }}>
                        <p className="text-sm text-white/70">Admin Panel</p>
                        <p className="mt-1 text-lg font-semibold text-white">Control Center</p>
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${secondary}26`, color: secondary }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: secondary }} /> Online
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-4 pb-6">
                    <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">Navigation</p>
                    <div className="space-y-1">
                        {navigation.map((item) => {
                            const active = pathname === item.href;
                            const Icon = item.icon;
                            return (
                                <Link key={item.href} href={item.href}
                                    className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${active
                                            ? "text-slate-950 shadow-lg"
                                            : "text-white/70 hover:bg-white/8 hover:text-white"
                                        }`}
                                    style={active ? { backgroundColor: secondary, boxShadow: `0 4px 14px ${secondary}33` } : {}}
                                    onClick={() => { if (window.innerWidth < 1024) onClose(); }}>
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/20" : "bg-white/10 group-hover:bg-white/15"}`}>
                                        <Icon size={18} />
                                    </span>
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                <div className="border-t border-white/10 px-6 py-5">
                    <Link href="/admin/settings"
                        className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                            pathname === "/admin/settings" ? "text-slate-950 shadow-lg" : "text-white/70 hover:bg-white/8 hover:text-white"
                        }`}
                        style={pathname === "/admin/settings" ? { backgroundColor: secondary, boxShadow: `0 4px 14px ${secondary}33` } : {}}>
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${pathname === "/admin/settings" ? "bg-white/20" : "bg-white/10 group-hover:bg-white/15"}`}>
                            <Settings size={18} />
                        </span>
                        <span>Settings</span>
                    </Link>
                </div>
            </aside>
        </>
    );
}
