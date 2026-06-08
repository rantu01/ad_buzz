"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";

export default function AdAccountPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [adAccounts, setAdAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    async function loadData() {
      if (!user?.uid) { setIsLoading(false); return; }
      try {
        setError("");
        const res = await fetch(`/api/user/ad-accounts?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to load ad accounts.");
        setAdAccounts(data.adAccounts || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user?.uid]);

  if (authLoading || isLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading ad accounts...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Ad Accounts</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Your Ad Accounts</h1>
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm">{error}</div>}

      {adAccounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-lg font-semibold text-slate-900">No Ad Accounts</p>
          <p className="text-sm text-slate-500 mt-1">You have no ad accounts assigned yet. Contact admin for support.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adAccounts.map((acc) => (
            <div key={acc._id || acc.metaAdAccountId} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600 transition">{acc.name || `Ad Account ${acc.metaAdAccountId}`}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {acc.metaAdAccountId}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${acc.status === 'active' ? 'bg-emerald-50 text-emerald-700' : acc.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>{acc.status || 'active'}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Budget</p>
                  <p className="text-lg font-bold text-slate-900">${formatMoney(acc.budget)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Spent</p>
                  <p className="text-lg font-bold text-slate-900">${formatMoney(acc.spent)}</p>
                </div>
              </div>

              <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-400 to-rose-500 rounded-full transition-all" style={{ width: `${Math.min(100, (Number(acc.spent) / Number(acc.budget || 1)) * 100)}%` }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2"><span className="font-medium text-slate-700">{Math.min(100, Math.round((Number(acc.spent) / Number(acc.budget || 1)) * 100))}%</span> of budget used</p>

              {acc.insights && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Performance</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg"><p className="text-slate-500">Impressions</p><p className="font-semibold text-slate-900">{(acc.insights.impressions || 0).toLocaleString()}</p></div>
                    <div className="bg-slate-50 p-2 rounded-lg"><p className="text-slate-500">Clicks</p><p className="font-semibold text-slate-900">{(acc.insights.clicks || 0).toLocaleString()}</p></div>
                    <div className="bg-slate-50 p-2 rounded-lg"><p className="text-slate-500">CTR</p><p className="font-semibold text-slate-900">{Number(acc.insights.ctr || 0).toFixed(2)}%</p></div>
                  </div>
                </div>
              )}

              <div className="mt-4 text-xs text-slate-400 flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${acc.status === 'active' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                Last synced: {acc.lastSynced ? new Date(acc.lastSynced).toLocaleString() : 'N/A'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
