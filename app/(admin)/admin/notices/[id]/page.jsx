"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import NoticeEditor from "../components/NoticeEditor";

export default function EditNoticePage() {
  const params = useParams();
  const id = params?.id;
  const { user } = useAuth();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user?.uid) return;
    let mounted = true;
    authFetch(`/api/admin/notices?id=${encodeURIComponent(id)}`, {}, user)
      .then((res) => res.json())
      .then((data) => { if (mounted && data.success) setNotice(data.notice); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id, user]);

  if (loading) {
    return (
      <div className="flex justify-center py-20" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">Notice not found</p>
      </div>
    );
  }

  return <NoticeEditor initial={notice} />;
}
