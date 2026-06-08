"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import Swal from "sweetalert2";

const BDT_TO_USD_RATE = 0.009;

export default function DepositsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [account, setAccount] = useState("");
  const [amountBDT, setAmountBDT] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const creditedUSD = amountBDT && !isNaN(parseFloat(amountBDT))
    ? (parseFloat(amountBDT) * BDT_TO_USD_RATE).toFixed(2)
    : "0.00";

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!account.trim()) { Swal.fire("Required", "Please enter your account details.", "warning"); return; }
    const bdt = parseFloat(amountBDT);
    if (!bdt || isNaN(bdt) || bdt <= 0) { Swal.fire("Invalid amount", "Enter a valid deposit amount in BDT.", "warning"); return; }
    if (!transactionRef.trim()) { Swal.fire("Required", "Please enter the transaction reference.", "warning"); return; }

    setSubmitting(true);
    try {
      const screenshotBase64 = screenshot ? await toBase64(screenshot) : null;
      const res = await fetch(`/api/user/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          amount: creditedUSD,
          amountBDT: bdt,
          account: account.trim(),
          transactionRef: transactionRef.trim(),
          creditedUSD,
          paymentMethod,
          screenshot: screenshotBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create deposit.");
      Swal.fire({
        icon: "success",
        title: "Deposit Submitted",
        text: "Your deposit request has been sent to admin for approval.",
      });
      setAccount("");
      setAmountBDT("");
      setTransactionRef("");
      setScreenshot(null);
      setScreenshotPreview("");
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Payments</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">New Deposit</h1>
        <p className="text-sm text-slate-600 mt-1">
          Send funds to the provided account and fill in the details below. Admin will verify and credit your wallet.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Account</label>
            <input type="text" required value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. bKash/Nagad account number"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (BDT)</label>
            <input type="number" step="0.01" min="0" required value={amountBDT} onChange={(e) => setAmountBDT(e.target.value)} placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Credited (USD)</label>
            <input type="text" readOnly value={`$${creditedUSD}`}
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-slate-900 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Ref</label>
            <input type="text" required value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="TrxID / Reference number"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500">
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="crypto">Cryptocurrency</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Screenshot (optional)</label>
            <input type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files[0];
              setScreenshot(file);
              setScreenshotPreview(file ? URL.createObjectURL(file) : "");
            }}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 text-sm file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-medium hover:file:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
            {screenshotPreview && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotPreview} alt="Preview" className="max-h-36 rounded-lg border border-slate-200" />
              </div>
            )}
          </div>
        </div>

        <button type="submit" disabled={submitting}
          className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:from-orange-700 hover:to-rose-700 transition disabled:opacity-50">
          {submitting ? "Submitting..." : "Submit Deposit"}
        </button>
      </form>
    </div>
  );
}
