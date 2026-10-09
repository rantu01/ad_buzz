'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/Component/Auth/AuthProvider';
import UserSidebar from './components/Sidebar';
import UserTopbar from './components/Topbar';
import UserAlertProvider from './components/UserAlertProvider';
import { useLoginSession } from '@/app/Component/Hooks/useLoginSession';

export default function ClientLayout({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [open, setOpen] = React.useState(false);

  // Track this browser as an active login device (best-effort, per browser).
  useLoginSession(user?.uid, user?.email);

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/');
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8F3] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <UserAlertProvider>
      <UserSidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-h-screen lg:pl-64">
        <UserTopbar onToggle={() => setOpen((v) => !v)} />
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </UserAlertProvider>
  );
}
