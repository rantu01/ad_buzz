"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

export default function AdminHelpCenterFeedbackPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const headers = { "x-user-id": uid || "" };

  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [articleFilter, setArticleFilter] = useState("all");

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const params = articleFilter !== "all" ? `?articleId=${articleFilter}` : "";
      const res = await fetch(`/api/admin/help-center/feedback${params}`, { headers, cache: "no-store" });
      const data = await res.json();
      if (data.success) setStats(data.stats || []);
    } catch {}
    finally { setLoading(false); }
  }, [uid, articleFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Feedback</h1>
        <p className="text-sm text-slate-500">Article feedback statistics.</p>
      </div>

      <div className="mb-4">
        <select value={articleFilter} onChange={(e) => setArticleFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All Articles</option>
          {stats.map((s) => <option key={s.articleId} value={s.articleId}>{s.title}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Article</th>
                <th className="px-4 py-3">Yes</th>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Helpful %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.map((s) => (
                <tr key={s.articleId}>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.title}</td>
                  <td className="px-4 py-3 text-green-600">{s.yes}</td>
                  <td className="px-4 py-3 text-red-600">{s.no}</td>
                  <td className="px-4 py-3 text-slate-600">{s.total}</td>
                  <td className="px-4 py-3 text-slate-600">{s.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
