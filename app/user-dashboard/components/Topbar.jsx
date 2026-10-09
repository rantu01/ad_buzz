"use client";

import { Menu, LifeBuoy } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import NotificationBell from "@/app/Component/Notifications/NotificationBell";
import { useUserAlerts } from "./UserAlertProvider";

export default function UserTopbar({ onToggle }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const settings = useSettings();
  const [profile, setProfile] = useState(null);
  const { unread, items, markRead, markAllRead, soundOn, toggleSound, refresh } = useUserAlerts();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
    router.refresh();
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user?.uid) return setProfile(null);
      const res = await fetch(`/api/user/profile?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (mounted && data?.success) setProfile(data.user);
    }
    load();
    return () => (mounted = false);
  }, [user?.uid]);

  return (
    <header className="sticky top-0 z-20 border-b border-[#F1E7DF] bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onToggle}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F1E7DF] bg-white text-slate-700 shadow-sm transition hover:border-secondary hover:text-primary-700 lg:hidden"
            aria-label="Toggle sidebar">
            <Menu size={18} />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: settings?.secondaryColor || "#F48E2B" }}>Dashboard</p>
            <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">Welcome{profile?.displayName ? `, ${profile.displayName}` : user?.email ? `, ${user.email.split('@')[0]}` : ''}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
            <NotificationBell
              unread={unread}
              items={items}
              title="Notifications"
              subtitle="Ticket replies, stage changes & deposit updates"
              emptyText="No new notifications."
              viewAllLabel="View all notifications"
              onOpen={refresh}
              onSelect={(n) => {
                if (!n) return;
                if (n.refType === "ticket" && n.refId) {
                  markRead(String(n._id), { ticketDbId: String(n.refId) });
                  try {
                    if (typeof window !== "undefined") {
                      window.sessionStorage.setItem("ab_highlight_ticket", String(n.refId));
                    }
                  } catch { /* navigation still works */ }
                  router.push("/user-dashboard/support-tickets");
                  return;
                }
                markRead(String(n._id));
                if (n.link) router.push(n.link);
              }}
              onViewAll={() => router.push("/user-dashboard/notifications")}
              onMarkAllRead={markAllRead}
              soundOn={soundOn}
              onToggleSound={toggleSound}
              accentClass="bg-amber-100 text-amber-700"
              icon={<LifeBuoy size={16} />}
            />
            <div className="flex items-center gap-3 rounded-2xl border border-[#F1E7DF] bg-white px-3 py-2 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${settings?.primaryColor || "#135B9A"}, ${settings?.secondaryColor || "#F48E2B"})` }}>
                <span className="h-full w-full flex items-center justify-center">AB</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{profile?.displayName || user?.email || 'Member'}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500">Account</p>
                  <button onClick={handleLogout} className="text-xs text-red-600 underline">Logout</button>
                </div>
              </div>
              <button onClick={handleLogout} className="sm:hidden text-xs text-red-600 underline font-medium">Logout</button>
            </div>
        </div>
      </div>
    </header>
  );
}
