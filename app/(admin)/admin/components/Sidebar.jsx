"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, X, DollarSign, History, Megaphone, RefreshCw, MessageSquare, BarChart3, Settings, LifeBuoy, TrendingUp, CreditCard, ArrowUpCircle } from "lucide-react";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { useAdmin } from "./AdminProvider";
import { getAllowedRoutes } from "@/lib/permissions";

const ICON_MAP = {
  overview: LayoutGrid,
  deposits: DollarSign,
  withdrawals: DollarSign,
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
};

const ALL_NAV = [
  { label: "Overview", href: "/admin", key: "overview" },
  { label: "Deposit Verification", href: "/admin/deposits", key: "deposits" },
  { label: "Ad Accounts Insights", href: "/admin/ad-accounts", key: "ad-accounts" },
  { label: "Ad Accounts TopUp", href: "/admin/ad-accounts-topup", key: "ad-accounts-topup" },
  { label: "User Management", href: "/admin/user-management", key: "user-management" },
  { label: "Payment Methods", href: "/admin/payment-methods", key: "payment-methods" },
  { label: "Support Tickets", href: "/admin/support-tickets", key: "support-tickets" },
  { label: "Balance Logs", href: "/admin/balance-logs", key: "balance-logs" },
  { label: "Top-Up Insights", href: "/admin/top-up-insights", key: "top-up-insights" },
  { label: "Reports", href: "/admin/reports", key: "reports" },
  { label: "Meta API", href: "/admin/meta-api", key: "meta-api" },
  { label: "WhatsApp", href: "/admin/whatsapp", key: "whatsapp" },
  { label: "Settings", href: "/admin/settings", key: "settings" },
];

export default function DashboardSidebar({ open, onClose }) {
  const pathname = usePathname();
  const settings = useSettings();
  const { profile } = useAdmin();
  const logo = settings?.logo || "/logo.jpeg";
  const secondary = settings?.secondaryColor || "#F48E2B";
  const role = profile?.role || "customer";

  const allowed = getAllowedRoutes(role);
  const navItems = ALL_NAV.filter((item) =>
    item.key === "overview" ? true : allowed.includes(item.key)
  );
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur" style={{ borderColor: `${secondary}33` }}>
            <p className="text-sm text-white/70">Dashboard</p>
            <p className="mt-1 text-lg font-semibold text-white capitalize">{roleLabel}</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${secondary}26`, color: secondary }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: secondary }} /> Online
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-6">
          <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">Navigation</p>
          <div className="space-y-1">
            {navItems.map((item) => {
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
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}
