"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import UserSidebar from "@/app/user-dashboard/components/Sidebar";
import UserAlertProvider from "@/app/user-dashboard/components/UserAlertProvider";
import { useLoginSession } from "@/app/Component/Hooks/useLoginSession";

const SidebarCtx = React.createContext({ openSidebar: () => {} });
export function useHelpCenterSidebar() {
  return React.useContext(SidebarCtx);
}

export default function HelpCenterLayout({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [open, setOpen] = React.useState(false);
  useLoginSession(user?.uid, user?.email);

  React.useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/");
  }, [loading, router, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8F3] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <UserAlertProvider>
      <SidebarCtx.Provider value={{ openSidebar: () => setOpen(true) }}>
        <UserSidebar open={open} onClose={() => setOpen(false)} />
        <div className="min-h-screen bg-[#FFF8F3] text-slate-900 lg:pl-64">
          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </SidebarCtx.Provider>
    </UserAlertProvider>
  );
}
