"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { LayoutGrid, Users, User, X, DollarSign, History, Megaphone, RefreshCw, MessageSquare, BarChart3, Settings, LifeBuoy, TrendingUp, CreditCard, ArrowUpCircle, ShieldCheck, ChevronDown } from "lucide-react";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { useAdmin } from "./AdminProvider";
import { useTicketAlerts } from "./TicketAlertProvider";
import { useDepositAlerts } from "./DepositAlertProvider";
import { getAllowedRoutes } from "@/lib/permissions";

const ICON_MAP = {
  overview: LayoutGrid,
  deposits: DollarSign,
  "ad-accounts": Megaphone,
  "user-management": Users,
  "payment-methods": CreditCard,
  "support-tickets": LifeBuoy,
  "balance-logs": History,
  "top-up-insights": TrendingUp,
  "ad-accounts-topup": ArrowUpCircle,
  reports: BarChart3,
  "meta-api": RefreshCw,
  whatsapp: MessageSquare,
  settings: Settings,
  roles: ShieldCheck,
  profile: User,
};

const ALL_NAV = [
  { label: "Overview", href: "/admin", key: "overview" },
  { label: "Ad Accounts Insights", href: "/admin/ad-accounts", key: "ad-accounts" },
  { label: "Ad Accounts TopUp", href: "/admin/ad-accounts-topup", key: "ad-accounts-topup" },
  { label: "Deposit Verification", href: "/admin/deposits", key: "deposits" },
  { label: "Support Tickets", href: "/admin/support-tickets", key: "support-tickets" },
  { label: "Payment Methods", href: "/admin/payment-methods", key: "payment-methods" },
  { label: "Top-Up Insights", href: "/admin/top-up-insights", key: "top-up-insights" },
  { label: "Balance Logs", href: "/admin/balance-logs", key: "balance-logs" },
  { label: "User Management", href: "/admin/user-management", key: "user-management" },
  { label: "Roles & Permissions", href: "/admin/roles", key: "roles" },
  { label: "Reports", href: "/admin/reports", key: "reports" },
];

const SETTINGS_CHILDREN = [
  { label: "General", href: "/admin/settings", key: "settings" },
  { label: "Meta API", href: "/admin/meta-api", key: "meta-api" },
  { label: "WhatsApp", href: "/admin/whatsapp", key: "whatsapp" },
];

export default function DashboardSidebar({ open, onClose }) {
  const pathname = usePathname();
  const settings = useSettings();
  const { profile, access } = useAdmin();
  const { unread } = useTicketAlerts();
  const { pending: pendingDeposits } = useDepositAlerts();
  const badgeFor = (key) => {
    if (key === "support-tickets") return unread;
    if (key === "deposits") return pendingDeposits;
    return 0;
  };
  const logo = settings?.logo || "/logo.jpeg";
  const secondary = settings?.secondaryColor || "#F48E2B";
  const role = profile?.role || "customer";

  const allowed = getAllowedRoutes(role, access?.permissions);
  const navItems = ALL_NAV.filter((item) =>
    item.key === "overview" ? true : allowed.includes(item.key)
  );
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  // Requested sidebar order. Any existing item NOT listed here is kept and
  // rendered below the listed items, preserving its relative order.
  const NAV_ORDER = [
    "overview",
    "ad-accounts",
    "ad-accounts-topup",
    "deposits",
    "support-tickets",
    "payment-methods",
    "top-up-insights",
    "balance-logs",
    "user-management",
    "roles",
    "settings",
  ];
  const orderIndex = (key) => {
    const i = NAV_ORDER.indexOf(key);
    return i === -1 ? NAV_ORDER.length : i;
  };
  const orderedTopItems = navItems
    .filter((item) => NAV_ORDER.includes(item.key))
    .sort((a, b) => orderIndex(a.key) - orderIndex(b.key));
  const extraItems = navItems.filter((item) => !NAV_ORDER.includes(item.key));

  const renderNavItem = (item) => {
    const active = pathname === item.href;
    const Icon = ICON_MAP[item.key] || LayoutGrid;
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
        {badgeFor(item.key) > 0 && (
          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
            {badgeFor(item.key) > 99 ? "99+" : badgeFor(item.key)}
          </span>
        )}
      </Link>
    );
  };

  const settingsChildren = SETTINGS_CHILDREN.filter((item) => allowed.includes(item.key));
  const settingsActive = settingsChildren.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsExpanded = settingsOpen || settingsActive;

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
          </Link>
          <button onClick={onClose} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <div className="px-6 py-5">
          {/* Level Switcher */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800 border border-slate-700">
              {/* Level 1 */}
              <button
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-orange-500 text-white shadow-md cursor-default"
                title="Current Level"
                aria-current="page"
              >
                Level 1
              </button>

              {/* Level 2 */}
              <button
                onClick={() => {
                  window.location.href = "https://apps2.adsbuzzbd.com/";
                }}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-all duration-200 cursor-pointer"
                title="Go to Level 2"
              >
                Level 2
              </button>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-6">
          <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">Navigation</p>
          <div className="space-y-1">
            {orderedTopItems.map((item) => renderNavItem(item))}
            {settingsChildren.length > 0 && (
              <div>
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  aria-expanded={settingsExpanded}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${settingsActive
                    ? "text-slate-950 shadow-lg"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                    }`}
                  style={settingsActive ? { backgroundColor: secondary, boxShadow: `0 4px 14px ${secondary}33` } : {}}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${settingsActive ? "bg-white/20" : "bg-white/10 group-hover:bg-white/15"}`}>
                    <Settings size={18} />
                  </span>
                  <span className="flex-1 text-left">Settings</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${settingsExpanded ? "rotate-0" : "-rotate-90"}`} />
                </button>
                <div className={`grid transition-all duration-200 ease-in-out ${settingsExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-white/10 pl-6">
                      {settingsChildren.map((child) => {
                        const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                        const ChildIcon = ICON_MAP[child.key] || LayoutGrid;
                        return (
                          <Link key={child.href} href={child.href}
                            className={`group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${childActive
                              ? "text-slate-950 shadow-lg"
                              : "text-white/60 hover:bg-white/8 hover:text-white"
                              }`}
                            style={childActive ? { backgroundColor: secondary, boxShadow: `0 4px 14px ${secondary}33` } : {}}
                            onClick={() => { if (window.innerWidth < 1024) onClose(); }}>
                            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${childActive ? "bg-white/20" : "bg-white/10 group-hover:bg-white/15"}`}>
                              <ChildIcon size={16} />
                            </span>
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {extraItems.map((item) => renderNavItem(item))}
            {renderNavItem({ label: "Profile", href: "/admin/profile", key: "profile" })}
          </div>
        </nav>
      </aside>
    </>
  );
}
