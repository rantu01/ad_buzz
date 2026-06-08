"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import Swal from "sweetalert2";

export default function WithdrawalsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [withdrawals, setWithdrawals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletType, setWalletType] = useState("USDT (TRC20)");
  const [submitting, setSubmitting] = useState(false);

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const loadWithdrawals = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setError("");
      const res = await fetch(`/api/user/withdrawal?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load withdrawals.");
      setWithdrawals(data.withdrawals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadWithdrawals(); }, [loadWithdrawals]);

  async function handleSubmit(e) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || isNaN(parsed) || parsed <= 0) { Swal.fire("Invalid amount", "Enter a valid withdrawal amount.", "warning"); return; }
    if (!walletAddress || walletAddress.length < 10) { Swal.fire("Invalid Wallet", "Enter a valid wallet address.", "warning"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/user/withdrawal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, amount: parsed, walletAddress, walletType }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create withdrawal.");
      Swal.fire("Withdrawal Requested", "Your withdrawal request is pending approval.", "success");
      setAmount("");
      setWalletAddress("");
      loadWithdrawals();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || isLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading withdrawals...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Payments</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Withdrawals</h1>
        <p className="text-sm text-slate-600 mt-1">Request withdrawal of your wallet balance.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm order-2 lg:order-1">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Withdrawal History</h2>
          {withdrawals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">No withdrawals yet.</p>
              <p className="text-xs text-slate-400 mt-1">Use the form to request a withdrawal.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {withdrawals.map((w) => (
                <div key={w._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">${formatMoney(w.amount)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{new Date(w.createdAt).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 truncate font-mono">{w.walletAddress}</p>
                  </div>
                  <span className={`ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize shrink-0 ${w.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : w.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">New Withdrawal</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (USD)</label>
              <input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Wallet Type</label>
              <select value={walletType} onChange={(e) => setWalletType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500">
                <option value="USDT (TRC20)">USDT (TRC20)</option>
                <option value="USDT (ERC20)">USDT (ERC20)</option>
                <option value="BTC">Bitcoin (BTC)</option>
                <option value="ETH">Ethereum (ETH)</option>
                <option value="BNB">Binance (BNB)</option>
              </select>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">Wallet Address</label>
              <input type="text" required value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Enter your wallet address"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:from-orange-700 hover:to-rose-700 transition disabled:opacity-50">
              {submitting ? "Submitting..." : "Request Withdrawal"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
