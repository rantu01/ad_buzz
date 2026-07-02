"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { ChevronRight, DollarSign, Info, Check, Plus, Trash2, X, ArrowLeft, Upload } from "lucide-react";
import Swal from "sweetalert2";

const BDT_TO_USD_RATE = 1 / 129;
const USD_TO_BDT = 129;

export default function DepositsPage() {
  const { user, loading: authLoading } = useAuth();
  const settings = useSettings();
  const activeColor = settings?.secondaryColor || "#F48E2B";

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balance, setBalance] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [amountBDT, setAmountBDT] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");

  const [form, setForm] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    branch: "",
    referenceId: "",
  });

  const creditedUSD = amountBDT && !isNaN(parseFloat(amountBDT))
    ? (parseFloat(amountBDT) * BDT_TO_USD_RATE).toFixed(2)
    : "0.00";

  const loadBalance = useCallback(async () => {
    if (!user?.uid) { setIsLoadingBalance(false); return; }
    try {
      const res = await fetch(`/api/user/dashboard?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (data.success) setBalance(data.dashboard.availableBalance || 0);
    } catch { /* ignore */ }
    finally { setIsLoadingBalance(false); }
  }, [user?.uid]);

  const loadAccounts = useCallback(async () => {
    if (!user?.uid) { setLoadingAccounts(false); return; }
    try {
      const res = await fetch(`/api/user/bank-accounts?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (data.success) setBankAccounts(data.accounts || []);
    } catch { /* ignore */ }
    finally { setLoadingAccounts(false); }
  }, [user?.uid]);

  useEffect(() => { loadBalance(); }, [loadBalance]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  function resetAll() {
    setCurrentStep(1);
    setSelectedAccount(null);
    setAmountBDT("");
    setTransactionRef("");
    setScreenshot(null);
    setScreenshotPreview("");
  }

  function resetForm() {
    setForm({ bankName: "", accountName: "", accountNumber: "", branch: "", referenceId: "" });
  }

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });
  }

  function goToNextStep() {
    const bdt = parseFloat(amountBDT);
    if (!bdt || isNaN(bdt) || bdt <= 0) {
      Swal.fire("Required", "Please enter a valid deposit amount in BDT.", "warning");
      return;
    }
    if (!transactionRef.trim()) {
      Swal.fire("Required", "Please enter the transaction reference number.", "warning");
      return;
    }
    setCurrentStep(3);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const screenshotBase64 = screenshot ? await toBase64(screenshot) : null;
      const res = await fetch("/api/user/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          amount: creditedUSD,
          amountBDT: parseFloat(amountBDT),
          account: selectedAccount.accountNumber,
          transactionRef: transactionRef.trim(),
          creditedUSD,
          paymentMethod: selectedAccount.bankName,
          screenshot: screenshotBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to submit deposit.");

      await Swal.fire({
        icon: "success",
        title: "Deposit Submitted",
        text: "Your deposit request has been sent to admin for approval.",
        timer: 2000,
        showConfirmButton: false,
      });

      resetAll();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddAccount(e) {
    e.preventDefault();
    if (!form.bankName.trim() || !form.accountName.trim() || !form.accountNumber.trim() || !form.branch.trim()) {
      Swal.fire("Required", "Please fill in all required fields.", "warning");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to add account.");
      setBankAccounts((prev) => [data.account, ...prev]);
      setShowAddModal(false);
      resetForm();
      Swal.fire({ icon: "success", title: "Added", text: "Bank account added successfully.", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(id) {
    const result = await Swal.fire({
      title: "Remove account?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`/api/user/bank-accounts?id=${id}&uid=${encodeURIComponent(user.uid)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete.");
      setBankAccounts((prev) => prev.filter((a) => a._id !== id));
      if (selectedAccount?._id === id) { setSelectedAccount(null); setCurrentStep(1); }
      Swal.fire({ icon: "success", title: "Removed", text: "Bank account removed.", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  const steps = [
    { number: 1, label: "Select Method" },
    { number: 2, label: "Payment Details" },
    { number: 3, label: "Review & Submit" },
  ];

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Payments</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Make Payments</h1>
        <p className="text-sm text-slate-600 mt-1">This balance can be used across all your ad accounts.</p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-start gap-0">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    currentStep === step.number ? "text-white shadow-sm" : currentStep > step.number ? "text-white" : "bg-slate-200 text-slate-500"
                  }`}
                  style={currentStep >= step.number ? { backgroundColor: activeColor } : {}}
                >
                  {currentStep > step.number ? <Check className="h-4 w-4" /> : step.number}
                </div>
                <span className={`text-sm font-medium ${currentStep >= step.number ? "text-slate-900" : "text-slate-400"}`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <ChevronRight className="mx-5 h-5 w-5 text-slate-300" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Current Balance</p>
              {isLoadingBalance ? (
                <div className="mt-1 h-6 w-28 animate-pulse rounded bg-slate-200" />
              ) : (
                <p className="text-xl font-bold text-slate-900">${formatMoney(balance)} USD</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5">
            <Info className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sm text-amber-800">
              Your conversion rate: <span className="font-semibold">{USD_TO_BDT} BDT</span> = <span className="font-semibold">1 USD</span>
            </span>
          </div>
        </div>
      </div>

      {currentStep === 1 && (
        <Step1SelectMethod
          bankAccounts={bankAccounts}
          loadingAccounts={loadingAccounts}
          selectedAccount={selectedAccount}
          onSelect={setSelectedAccount}
          onContinue={() => { if (selectedAccount) setCurrentStep(2); else Swal.fire("Required", "Please select a bank account first.", "warning"); }}
          onAdd={() => setShowAddModal(true)}
          onDelete={handleDeleteAccount}
          activeColor={activeColor}
        />
      )}

      {currentStep === 2 && selectedAccount && (
        <Step2PaymentDetails
          bank={selectedAccount}
          amountBDT={amountBDT}
          setAmountBDT={setAmountBDT}
          creditedUSD={creditedUSD}
          transactionRef={transactionRef}
          setTransactionRef={setTransactionRef}
          screenshot={screenshot}
          screenshotPreview={screenshotPreview}
          setScreenshot={setScreenshot}
          setScreenshotPreview={setScreenshotPreview}
          onBack={() => setCurrentStep(1)}
          onContinue={goToNextStep}
          activeColor={activeColor}
        />
      )}

      {currentStep === 3 && selectedAccount && (
        <Step3ReviewSubmit
          bank={selectedAccount}
          amountBDT={amountBDT}
          creditedUSD={creditedUSD}
          transactionRef={transactionRef}
          screenshotPreview={screenshotPreview}
          onBack={() => setCurrentStep(2)}
          onSubmit={handleSubmit}
          submitting={submitting}
          activeColor={activeColor}
        />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Bank Account</h3>
              <button onClick={() => { setShowAddModal(false); resetForm(); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <InputField label="Bank Name *" value={form.bankName} onChange={(v) => setForm((p) => ({ ...p, bankName: v }))} placeholder="e.g. Eastern Bank PLC" />
              <InputField label="Account Name *" value={form.accountName} onChange={(v) => setForm((p) => ({ ...p, accountName: v }))} placeholder="e.g. Md. Razu Ahmed" />
              <InputField label="Account Number *" value={form.accountNumber} onChange={(v) => setForm((p) => ({ ...p, accountNumber: v }))} placeholder="e.g. 1502200001234" />
              <InputField label="Branch *" value={form.branch} onChange={(v) => setForm((p) => ({ ...p, branch: v }))} placeholder="e.g. Gulshan Branch, Dhaka" />
              <InputField label="Reference ID" value={form.referenceId} onChange={(v) => setForm((p) => ({ ...p, referenceId: v }))} placeholder="Optional" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); resetForm(); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: activeColor }}>{saving ? "Saving..." : "Save Account"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Step1SelectMethod({ bankAccounts, loadingAccounts, selectedAccount, onSelect, onContinue, onAdd, onDelete, activeColor }) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Select Payment Method</h2>
          <p className="mt-1 text-sm text-slate-600">Choose a payment method to top up your balance</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ backgroundColor: activeColor }}>
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {loadingAccounts ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3"><div className="h-12 w-12 rounded-xl bg-slate-200" /><div className="flex-1 space-y-2"><div className="h-4 w-3/4 rounded bg-slate-200" /><div className="h-3 w-1/4 rounded bg-slate-200" /></div></div>
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, j) => (<div key={j} className="h-4 w-full rounded bg-slate-200" />))}</div>
              <div className="mt-5 h-11 w-full rounded-xl bg-slate-200" />
            </div>
          ))}
        </div>
      ) : bankAccounts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-sm text-center">
          <DollarSign className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-lg font-semibold text-slate-700">No bank accounts yet</p>
          <p className="mt-1 text-sm text-slate-500">Add a bank account to start making payments</p>
          <button onClick={onAdd} className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ backgroundColor: activeColor }}>
            <Plus className="h-4 w-4" /> Add Your First Account
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((bank) => {
              const isSelected = selectedAccount?._id === bank._id;
              return (
                <BankCard
                  key={bank._id}
                  bank={bank}
                  isSelected={isSelected}
                  onSelect={() => onSelect(bank)}
                  onDelete={() => onDelete(bank._id)}
                  activeColor={activeColor}
                />
              );
            })}
          </div>
          <div className="mt-8 flex justify-center">
            <button onClick={onContinue} disabled={!selectedAccount} className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-40 hover:opacity-90" style={{ backgroundColor: activeColor }}>
              Continue to Payment Details <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Step2PaymentDetails({ bank, amountBDT, setAmountBDT, creditedUSD, transactionRef, setTransactionRef, screenshot, screenshotPreview, setScreenshot, setScreenshotPreview, onBack, onContinue, activeColor }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-xl font-bold text-slate-900">Payment Details</h2>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Selected Account</p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: bank.color || "#135B9A" }}>
            {(bank.shortCode || bank.bankName).slice(0, 3).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{bank.bankName}</p>
            <p className="text-xs text-slate-500">{bank.accountNumber} — {bank.branch}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount in BDT *</label>
            <input type="number" step="0.01" min="0" required value={amountBDT} onChange={(e) => setAmountBDT(e.target.value)} placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
            <p className="mt-1.5 text-xs text-slate-500">Credited: <span className="font-semibold text-emerald-600">${creditedUSD} USD</span></p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Transaction Reference *</label>
            <input type="text" required value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="TrxID / Reference number"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Screenshot <span className="text-slate-400">(optional)</span></label>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
                <Upload className="h-4 w-4" />
                Choose File
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setScreenshot(file);
                  setScreenshotPreview(URL.createObjectURL(file));
                }} />
              </label>
              {screenshot && <span className="text-xs text-slate-500">{screenshot.name}</span>}
            </div>
            {screenshotPreview && (
              <div className="mt-3 inline-block overflow-hidden rounded-xl border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotPreview} alt="Preview" className="max-h-32 w-auto" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
          <button onClick={onContinue} className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ backgroundColor: activeColor }}>
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step3ReviewSubmit({ bank, amountBDT, creditedUSD, transactionRef, screenshotPreview, onBack, onSubmit, submitting, activeColor }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-xl font-bold text-slate-900">Review & Submit</h2>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Bank Account</h3>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: bank.color || "#135B9A" }}>
              {(bank.shortCode || bank.bankName).slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{bank.bankName}</p>
              <p className="text-xs text-slate-500">{bank.accountNumber} — {bank.branch}</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Details</h3>
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Amount (BDT)</span>
              <span className="font-semibold text-slate-900">{parseFloat(amountBDT).toLocaleString(undefined, { minimumFractionDigits: 2 })} BDT</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Credited (USD)</span>
              <span className="font-semibold text-emerald-600">${creditedUSD} USD</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Conversion Rate</span>
              <span className="text-slate-700">{USD_TO_BDT} BDT = 1 USD</span>
            </div>
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">Transaction Ref</span>
              <span className="font-mono font-semibold text-slate-900">{transactionRef}</span>
            </div>
          </div>
        </div>

        {screenshotPreview && (
          <div className="mb-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Screenshot</h3>
            <div className="inline-block overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={screenshotPreview} alt="Payment proof" className="max-h-40 w-auto" />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
          <button onClick={onSubmit} disabled={submitting} className="flex items-center gap-2 rounded-xl px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: activeColor }}>
            {submitting ? "Submitting..." : "Submit Deposit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BankCard({ bank, isSelected, onSelect, onDelete, activeColor }) {
  return (
    <div className={`group relative rounded-2xl border bg-white p-6 shadow-sm transition-all ${isSelected ? "border-emerald-400 ring-1 ring-emerald-400/50" : "border-slate-200 hover:border-slate-300"}`}>
      <button onClick={onDelete} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100" title="Remove account">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: bank.color || "#135B9A" }}>
          {(bank.shortCode || bank.bankName).slice(0, 3).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{bank.bankName}</h3>
          {bank.shortCode && <p className="text-xs text-slate-500">{bank.shortCode}</p>}
        </div>
      </div>
      <div className="mb-5 space-y-2.5 border-t border-slate-100 pt-4">
        <Row label="Account Name" value={bank.accountName} />
        <Row label="Account Number" value={bank.accountNumber} />
        <Row label="Branch" value={bank.branch} />
        {bank.referenceId && <Row label="Reference ID" value={bank.referenceId} highlight />}
      </div>
      <button onClick={onSelect} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition-all ${isSelected ? "bg-emerald-600 hover:bg-emerald-700" : "hover:opacity-90"}`} style={!isSelected ? { backgroundColor: activeColor } : {}}>
        {isSelected && <Check className="h-4 w-4" />}
        {isSelected ? "Selected" : "Select This Account"}
      </button>
    </div>
  );
}

function Row({ label, value, highlight = false }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="shrink-0 text-slate-500">{label}:</span>
      <span className={`truncate font-medium ${highlight ? "text-secondary" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input type="text" required={label.includes("*")} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
    </div>
  );
}
