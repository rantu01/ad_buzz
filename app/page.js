"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import LoginForm from "@/app/Component/Auth/LoginForm";
import { getDashboardPath } from "@/lib/authUtils";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    let mounted = true;

    async function redirect() {
      setRedirecting(true);
      const path = await getDashboardPath(user.uid);
      if (mounted) {
        router.replace(path);
      }
    }

    redirect();

    return () => {
      mounted = false;
    };
  }, [loading, user, router]);

  if (loading || (user && redirecting)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-100 via-white to-secondary-100">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-slate-500 mt-4">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-100 via-white to-secondary-100">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return <LoginForm onSuccess={(path) => window.location.assign(path)} />;
}
