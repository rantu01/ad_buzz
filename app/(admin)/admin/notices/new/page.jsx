"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import NoticeEditor from "../components/NoticeEditor";

function NewNoticeInner() {
  const searchParams = useSearchParams();
  const revisionOf = searchParams.get("revisionOf");
  const { user } = useAuth();
  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(Boolean(revisionOf));

  useEffect(() => {
    if (!revisionOf || !user?.uid) return;
    let mounted = true;
    authFetch(`/api/admin/notices?id=${encodeURIComponent(revisionOf)}`, {}, user)
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !data.success) return;
        const source = data.notice || {};
        setInitial({
          ...source,
          _id: undefined,
          title: `${source.title} (Revision)`,
          status: "draft",
          publishedAt: null,
          scheduledAt: null,
          revisionOf: source._id,
        });
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [revisionOf, user]);

  if (loading) {
    return (
      <div className="flex justify-center py-20" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <NoticeEditor initial={initial} revisionOf={revisionOf || null} />;
}

export default function NewNoticePage() {
  return (
    <Suspense fallback={<div className="py-10 text-sm text-slate-500">Loading…</div>}>
      <NewNoticeInner />
    </Suspense>
  );
}
