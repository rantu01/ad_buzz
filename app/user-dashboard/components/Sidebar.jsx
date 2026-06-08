"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, ListChecks, User, CreditCard, X, AppWindowMac, DollarSign, ChevronDown } from "lucide-react";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";

const navigation = [
    { label: "Dashboard", href: "/user-dashboard", icon: AppWindowMac },
    { label: "Ad Account", href: "/user-dashboard/ad-account", icon: ListChecks },
    { label: "Profile", href: "/user-dashboard/profile", icon: User },
];

const paymentChildren = [
    { label: "New Payment", href: "/user-dashboard/deposits" },
    { label: "Payment History", href: "/user-dashboard/Payment-History" },
];

const balanceChildren = [
    { label: "Balance Overview", href: "/user-dashboard/balance" },
    { label: "Balance History", href: "/user-dashboard/balance-history" },
];

export default function UserSidebar({ open, onClose }) {
    const pathname = usePathname();
    const settings = useSettings();
    const logo = settings?.logo || "/logo.jpeg";
    const secondary = settings?.secondaryColor || "#F48E2B";

    const [paymentsOpen, setPaymentsOpen] = useState(
        pathname.startsWith("/user-dashboard/deposits") || pathname.startsWith("/user-dashboard/Payment-History") || pathname.startsWith("/user-dashboard/withdrawals")
    );
    const [balanceOpen, setBalanceOpen] = useState(
        pathname.startsWith("/user-dashboard/balance")
    );

    const handleNavClick = () => {
        if (window.innerWidth < 1024) onClose();
    };

    const paymentsActive = pathname.startsWith("/user-dashboard/deposits") || pathname.startsWith("/user-dashboard/Payment-History") || pathname.startsWith("/user-dashboard/withdrawals");
    const balanceActive = pathname.startsWith("/user-dashboard/balance");

    const activeBg = { backgroundColor: secondary };

    return (
        <>
            <div
                className={`fixed inset-0 z-30 bg-slate-950/50 transition-opacity duration-200 lg:hidden ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            />

            <aside
                className={`fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-white/5 bg-gradient-to-b from-[#FFF7ED] via-[#FFFBF7] to-[#FFF7F0] text-slate-900 transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <Link href="/">
                        <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logo} alt="Ad Buzz" className="h-8 w-auto" />
                            {/* <div>
                                <p className="text-xs uppercase tracking-[0.35em]" style={{ color: secondary }}>{settings?.siteName || "Ad Buzz"}</p>
                                <h2 className="mt-1 text-lg font-semibold">Your Dashboard</h2>
                            </div> */}
                        </div>
                    </Link>
                    <button onClick={onClose} className="rounded-full p-2 text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Close sidebar"><X size={18} /></button>
                </div>

                <nav className="flex-1 px-4 py-6">
                    <div className="space-y-1">
                        {navigation.map((item) => {
                            const active = pathname === item.href;
                            const Icon = item.icon;
                            return (
                                <Link key={item.href} href={item.href}
                                    className={`group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${active ? "text-white shadow" : "text-slate-700 hover:bg-slate-50"}`}
                                    style={active ? { backgroundColor: secondary } : {}}
                                    onClick={handleNavClick}>
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/10" : "bg-white/5"}`}><Icon size={18} /></span>
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}

                        <div>
                            <button onClick={() => setPaymentsOpen(!paymentsOpen)}
                                className={`group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${paymentsActive ? "text-white shadow" : "text-slate-700 hover:bg-slate-50"}`}
                                style={paymentsActive ? activeBg : {}}>
                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${paymentsActive ? "bg-white/10" : "bg-white/5"}`}><DollarSign size={18} /></span>
                                <span className="flex-1 text-left">Payments</span>
                                <ChevronDown size={16} className={`transition-transform duration-200 ${paymentsOpen ? "rotate-0" : "-rotate-90"}`} />
                            </button>
                            <div className={`grid transition-all duration-200 ease-in-out ${paymentsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                                <div className="overflow-hidden">
                                    <div className="ml-4 mt-1 space-y-1 pl-6 border-l-2 border-slate-200">
                                        {paymentChildren.map((child) => {
                                            const childActive = pathname === child.href;
                                            return (<Link key={child.href} href={child.href} onClick={handleNavClick}
                                                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${childActive ? "text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                                                style={childActive ? { backgroundColor: secondary } : {}}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${childActive ? "bg-white" : "bg-slate-300"}`} style={childActive ? { backgroundColor: secondary } : {}} />{child.label}</Link>);
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <button onClick={() => setBalanceOpen(!balanceOpen)}
                                className={`group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${balanceActive ? "text-white shadow" : "text-slate-700 hover:bg-slate-50"}`}
                                style={balanceActive ? activeBg : {}}>
                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${balanceActive ? "bg-white/10" : "bg-white/5"}`}><CreditCard size={18} /></span>
                                <span className="flex-1 text-left">Balance</span>
                                <ChevronDown size={16} className={`transition-transform duration-200 ${balanceOpen ? "rotate-0" : "-rotate-90"}`} />
                            </button>
                            <div className={`grid transition-all duration-200 ease-in-out ${balanceOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                                <div className="overflow-hidden">
                                    <div className="ml-4 mt-1 space-y-1 pl-6 border-l-2 border-slate-200">
                                        {balanceChildren.map((child) => {
                                            const childActive = pathname === child.href;
                                            return (<Link key={child.href} href={child.href} onClick={handleNavClick}
                                                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${childActive ? "text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                                                style={childActive ? { backgroundColor: secondary } : {}}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${childActive ? "bg-white" : "bg-slate-300"}`} style={childActive ? { backgroundColor: secondary } : {}} />{child.label}</Link>);
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>

                <div className="border-t border-slate-200 px-6 py-5">
                    <div className="rounded-lg bg-white p-3"><p className="text-sm text-slate-700">Need help?</p><p className="mt-1 text-xs text-slate-500">Contact support for account help.</p></div>
                </div>
            </aside>
        </>
    );
}
