"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { isStaffRole } from "@/lib/permissions";

const AdminContext = createContext(null);

export function useAdmin() {
  return useContext(AdminContext);
}

export default function AdminProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchProfile() {
      if (authLoading) return;
      if (!user?.uid) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/user/dashboard?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (mounted && data.success) {
          setProfile(data.dashboard);
        }
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    }
    fetchProfile();
    return () => { mounted = false; };
  }, [user?.uid, authLoading]);

  const isStaff = profile && isStaffRole(profile.role);
  const value = { profile, loading: loading || authLoading, isStaff };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
