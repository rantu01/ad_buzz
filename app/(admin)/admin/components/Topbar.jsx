"use client";

import { Menu, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";

export default function DashboardTopbar({ onToggle }) {
    const router = useRouter();
    const { logout } = useAuth();
    const settings = useSettings();
    const logo = settings?.logo || "/logo.jpeg";

    const handleLogout = async () => {
        await logout();
        router.replace("/");
        router.refresh();
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo} alt="Ad Buzz" className="h-8 w-auto hidden sm:block" />
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">Dashboard</p>
                            <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">{settings?.siteName || "Ad Buzz"} Control Center</h1>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
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
