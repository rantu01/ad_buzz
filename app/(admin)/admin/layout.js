"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { isStaffRole, canAccessAdminPath, getAdminRouteKey } from "@/lib/permissions";
import AdminProvider, { useAdmin } from "./components/AdminProvider";
import DashboardSidebar from "./components/Sidebar";
import DashboardTopbar from "./components/Topbar";

function AccessDenied() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <ShieldAlert size={24} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Access Denied</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your role does not have permission to access this page.
        </p>
      </div>
    </div>
  );
}

function DashboardLayoutInner({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: adminLoading, isStaff, access } = useAdmin();
  const [open, setOpen] = useState(false);

  const loading = authLoading || adminLoading;

  useEffect(() => {
    if (loading) return;
    if (!user?.uid) {
      router.replace("/");
      return;
    }
    // Non-staff users do not belong in the admin panel at all.
    if (profile && !isStaffRole(profile.role)) {
      router.replace("/user-dashboard");
    }
  }, [loading, router, user?.uid, profile, profile?.role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F5F1] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user?.uid) return null;
  if (!profile || !isStaffRole(profile.role)) return null;

  // Per-route RBAC enforcement: block direct URL access to any admin page
  // the current role is not permitted to see. Unmapped paths and the
  // overview (/admin) remain accessible to all staff.
  const routeKey = getAdminRouteKey(pathname);
  const allowed =
    !routeKey || routeKey === "overview"
      ? true
      : canAccessAdminPath(profile.role, pathname, access?.permissions);

  return (
    <div className="min-h-screen bg-[#F8F5F1] text-slate-900">
      <DashboardSidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-h-screen lg:pl-72">
        <DashboardTopbar onToggle={() => setOpen((value) => !value)} />
        <main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">
            {allowed ? children : <AccessDenied />}
          </div>
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
