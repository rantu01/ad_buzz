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
  const [access, setAccess] = useState(null); // { permissions: { roleKey: [...] } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchProfile() {
      if (authLoading) return;
      if (!user?.uid) { setLoading(false); return; }
      try {
        const [dashRes, rolesRes] = await Promise.all([
          fetch(`/api/user/dashboard?uid=${encodeURIComponent(user.uid)}`),
          fetch("/api/admin/roles"),
        ]);
        const data = await dashRes.json();
        if (mounted && data.success) {
          setProfile(data.dashboard);
        }
        const rolesData = await rolesRes.json().catch(() => ({}));
        if (mounted && Array.isArray(rolesData.roles)) {
          setAccess({
            permissions: Object.fromEntries(
              rolesData.roles.map((r) => [r.key, r.permissions || []])
            ),
          });
        }
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    }
    fetchProfile();
    return () => { mounted = false; };
  }, [user?.uid, authLoading]);

  const isStaff = profile && isStaffRole(profile.role);
  const value = { profile, loading: loading || authLoading, isStaff, access };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
