"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { isStaffRole, ROLES } from "@/lib/permissions";
import AdminProvider from "./components/AdminProvider";
import DashboardSidebar from "./components/Sidebar";
import DashboardTopbar from "./components/Topbar";
import SyncPoller from "./components/SyncPoller";

function DashboardLayoutInner({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [roleChecking, setRoleChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function verifyRole() {
      if (loading) return;
      if (!user?.uid) {
        if (mounted) { setAuthorized(false); setRoleChecking(false); }
        router.replace("/");
        return;
      }
      try {
        const res = await fetch(`/api/user/dashboard?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        const validRole = Boolean(res.ok && data?.success && isStaffRole(data?.dashboard?.role));
        if (mounted) { setAuthorized(validRole); setRoleChecking(false); }
        if (!validRole) router.replace("/user-dashboard");
      } catch {
        if (mounted) { setAuthorized(false); setRoleChecking(false); }
        router.replace("/user-dashboard");
      }
    }
    verifyRole();
    return () => { mounted = false; };
  }, [loading, router, user?.uid]);

  if (loading || roleChecking) {
    return (
      <div className="min-h-screen bg-[#F8F5F1] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[#F8F5F1] text-slate-900">
      <SyncPoller />
      <DashboardSidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-h-screen lg:pl-72">
        <DashboardTopbar onToggle={() => setOpen((value) => !value)} />
        <main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <AdminProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </AdminProvider>
  );
}
