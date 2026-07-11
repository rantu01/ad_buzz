"use client";

import { useEffect, useState, useRef } from "react";
import Swal from "sweetalert2";
import { useAdmin } from "../components/AdminProvider";
import { Plus, X, Trash2, Edit3, Users, Check, Building2, Smartphone } from "lucide-react";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 20;

const WALLET_OPTIONS = ["Nagad", "BKash", "Rocket", "Upay", "Cellfin"];
const ACCOUNT_TYPE_OPTIONS = ["Personal", "Merchant"];

export default function PaymentMethodsPage() {
  const { profile } = useAdmin();
  const [methods, setMethods] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [methodType, setMethodType] = useState("bank");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    branch: "",
    referenceId: "",
    logo: "",
    walletName: "",
    walletNo: "",
    accountType: "",
    paymentInstructions: "",
    walletLogo: "",
  });

  const activeColor = "#F48E2B";

  const loadData = async () => {
    setLoading(true);
    try {
      const [methodsRes, usersRes] = await Promise.all([
        fetch("/api/admin/payment-methods"),
        fetch("/api/admin/users"),
      ]);
      const methodsData = await methodsRes.json();
      const usersData = await usersRes.json();
      if (methodsData.success) setMethods(methodsData.methods || []);
      if (usersData.success) setUsers(usersData.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });
  }

  function resetForm() {
    setForm({
      bankName: "", accountName: "", accountNumber: "", branch: "",
      referenceId: "", logo: "",
      walletName: "", walletNo: "", accountType: "", paymentInstructions: "", walletLogo: "",
    });
    setLogoFile(null);
    setLogoPreview(null);
    setEditing(null);
    setMethodType("bank");
  }

  async function handleSave(e) {
    e.preventDefault();

    if (methodType === "mobile-banking") {
      if (!form.walletName || !form.walletNo || !form.accountType) {
        Swal.fire("Required", "Please fill in Wallet Name, Wallet No, and Account Type.", "warning");
        return;
      }
    } else {
      if (!form.bankName.trim() || !form.accountName.trim() || !form.accountNumber.trim() || !form.branch.trim()) {
        Swal.fire("Required", "Please fill in all required fields.", "warning");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = editing ? { id: editing, ...form, type: methodType } : { ...form, type: methodType };
      if (logoFile) {
        const base64 = await toBase64(logoFile);
        if (methodType === "mobile-banking") {
          payload.walletLogo = base64;
        } else {
          payload.logo = base64;
        }
      }
      const url = "/api/admin/payment-methods";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save.");
      Swal.fire({ icon: "success", title: editing ? "Updated" : "Added", timer: 1500, showConfirmButton: false });
      setShowAddModal(false);
      resetForm();
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const result = await Swal.fire({
      title: "Remove payment method?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`/api/admin/payment-methods?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete.");
      Swal.fire({ icon: "success", title: "Removed", timer: 1500, showConfirmButton: false });
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  function openEdit(method) {
    const isMobile = method.type === "mobile-banking";
    setMethodType(isMobile ? "mobile-banking" : "bank");

    if (isMobile) {
      setForm({
        ...form,
        walletName: method.walletName || "",
        walletNo: method.walletNo || "",
        accountType: method.accountType || "",
        paymentInstructions: method.paymentInstructions || "",
        referenceId: method.referenceId || "",
        walletLogo: method.walletLogo || "",
      });
      setLogoPreview(method.walletLogo || null);
    } else {
      setForm({
        ...form,
        bankName: method.bankName || "",
        accountName: method.accountName || "",
        accountNumber: method.accountNumber || "",
        branch: method.branch || "",
        referenceId: method.referenceId || "",
        logo: method.logo || "",
      });
      setLogoPreview(method.logo || null);
    }
    setLogoFile(null);
    setEditing(method._id);
    setShowAddModal(true);
  }

  function openAssign(method) {
    setShowAssignModal(method._id);
  }

  async function handleAssign(methodId, uids) {
    try {
      const res = await fetch("/api/admin/payment-methods/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodId, uids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to assign.");
      Swal.fire({ icon: "success", title: "Assigned", timer: 1500, showConfirmButton: false });
      setShowAssignModal(null);
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const bankMethods = methods.filter((m) => m.type !== "mobile-banking");
  const mobileMethods = methods.filter((m) => m.type === "mobile-banking");
  const totalPages = Math.ceil(methods.length / ITEMS_PER_PAGE);
  const paginatedMethods = methods.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const paginatedBankMethods = paginatedMethods.filter((m) => m.type !== "mobile-banking");
  const paginatedMobileMethods = paginatedMethods.filter((m) => m.type === "mobile-banking");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Payment Methods</h1>
          <p className="text-sm text-slate-500 mt-0.5">{methods.length} total methods</p>
        </div>
        <button onClick={() => { resetForm(); setShowAddModal(true); }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: activeColor }}>
          <Plus className="h-4 w-4" /> Add Payment Method
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : methods.length ? (
        <div>
          {paginatedBankMethods.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Building2 size={20} /> Bank Accounts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedBankMethods.map((method) => renderCard(method, openEdit, openAssign, handleDelete))}
              </div>
            </div>
          )}

          {paginatedMobileMethods.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Smartphone size={20} /> Mobile Banking
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedMobileMethods.map((method) => renderCard(method, openEdit, openAssign, handleDelete))}
              </div>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-sm text-center">
          <p className="text-lg font-semibold text-slate-700">No payment methods yet</p>
          <p className="mt-1 text-sm text-slate-500">Create payment methods and assign them to users</p>
          <button onClick={() => { resetForm(); setShowAddModal(true); }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: activeColor }}>
            <Plus className="h-4 w-4" /> Add Your First Method
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{editing ? "Edit" : "Add"} Payment Method</h3>
              <button onClick={() => { setShowAddModal(false); resetForm(); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-3 mb-6">
              <button type="button" onClick={() => { if (!editing) setMethodType("bank"); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${methodType === "bank" ? "border-[#F48E2B] bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <Building2 size={18} /> Bank
              </button>
              <button type="button" onClick={() => { if (!editing) setMethodType("mobile-banking"); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${methodType === "mobile-banking" ? "border-[#F48E2B] bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <Smartphone size={18} /> Mobile Banking
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {methodType === "mobile-banking" ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Wallet Name *</label>
                    <select value={form.walletName} onChange={(e) => setForm((p) => ({ ...p, walletName: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary">
                      <option value="">Select wallet</option>
                      {WALLET_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <InputField label="Wallet No *" value={form.walletNo} onChange={(v) => setForm((p) => ({ ...p, walletNo: v }))} placeholder="e.g. 01XXXXXXXXX" />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Account Type *</label>
                    <select value={form.accountType} onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary">
                      <option value="">Select account type</option>
                      {ACCOUNT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Instructions</label>
                    <textarea value={form.paymentInstructions} onChange={(e) => setForm((p) => ({ ...p, paymentInstructions: e.target.value }))} rows={3} placeholder="Optional instructions"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                  </div>
                  <InputField label="Reference ID" value={form.referenceId} onChange={(v) => setForm((p) => ({ ...p, referenceId: v }))} placeholder="Optional" />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Wallet Logo</label>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setLogoFile(file);
                      setLogoPreview(URL.createObjectURL(file));
                    }} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-medium" />
                    {logoPreview && (
                      <div className="mt-2 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoPreview} alt="Logo preview" className="h-10 w-auto rounded-lg border border-slate-200" />
                        <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; setForm((p) => ({ ...p, walletLogo: "" })); }} className="text-xs text-red-600 underline hover:no-underline">Remove</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <InputField label="Bank Name *" value={form.bankName} onChange={(v) => setForm((p) => ({ ...p, bankName: v }))} placeholder="e.g. Eastern Bank PLC" />
                  <InputField label="Account Name *" value={form.accountName} onChange={(v) => setForm((p) => ({ ...p, accountName: v }))} placeholder="e.g. Md. Razu Ahmed" />
                  <InputField label="Account Number *" value={form.accountNumber} onChange={(v) => setForm((p) => ({ ...p, accountNumber: v }))} placeholder="e.g. 1502200001234" />
                  <InputField label="Branch *" value={form.branch} onChange={(v) => setForm((p) => ({ ...p, branch: v }))} placeholder="e.g. Gulshan Branch, Dhaka" />
                  <InputField label="Reference ID" value={form.referenceId} onChange={(v) => setForm((p) => ({ ...p, referenceId: v }))} placeholder="Optional" />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Bank Logo</label>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setLogoFile(file);
                      setLogoPreview(URL.createObjectURL(file));
                    }} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-medium" />
                    {logoPreview && (
                      <div className="mt-2 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoPreview} alt="Logo preview" className="h-10 w-auto rounded-lg border border-slate-200" />
                        <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; setForm((p) => ({ ...p, logo: "" })); }} className="text-xs text-red-600 underline hover:no-underline">Remove</button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: activeColor }}>{saving ? "Saving..." : editing ? "Update" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && (
        <AssignModal
          methodId={showAssignModal}
          methods={methods}
          users={users}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(null)}
          activeColor={activeColor}
        />
      )}
    </div>
  );
}

function renderCard(method, openEdit, openAssign, handleDelete) {
  const isMobile = method.type === "mobile-banking";
  const logo = isMobile ? method.walletLogo : method.logo;
  const name = isMobile ? method.walletName : method.bankName;

  return (
    <div key={method._id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl overflow-hidden"
          style={{ backgroundColor: method.color || "#135B9A" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-white">{(method.shortCode || name || "").slice(0, 3).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900">{name}</h3>
          <p className="text-xs text-slate-500">{method.shortCode || ""}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => openEdit(method)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Edit3 className="h-4 w-4" />
          </button>
          <button onClick={() => openAssign(method)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
            <Users className="h-4 w-4" />
          </button>
          <button onClick={() => handleDelete(method._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="space-y-2.5 border-t border-slate-100 pt-4">
        {isMobile ? (
          <>
            <Row label="Wallet No" value={method.walletNo} />
            <Row label="Account Type" value={method.accountType} />
            {method.paymentInstructions && <Row label="Instructions" value={method.paymentInstructions} />}
          </>
        ) : (
          <>
            <Row label="Account Name" value={method.accountName} />
            <Row label="Account Number" value={method.accountNumber} />
            <Row label="Branch" value={method.branch} />
          </>
        )}
        {method.referenceId && <Row label="Reference ID" value={method.referenceId} highlight />}
        <Row label="Assigned Users" value={`${(method.assignedUids || []).length} users`} />
      </div>
    </div>
  );
}

function AssignModal({ methodId, methods, users, onAssign, onClose, activeColor }) {
  const method = methods.find((m) => m._id === methodId);
  const currentUids = method?.assignedUids || [];
  const [selectedUids, setSelectedUids] = useState([...currentUids]);

  const isMobile = method?.type === "mobile-banking";
  const displayName = isMobile ? method?.walletName : method?.bankName;
  const displaySub = isMobile ? method?.walletNo : method?.accountNumber;

  function toggleUid(uid) {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[80vh] flex flex-col">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Assign Users</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        {method && (
          <p className="text-sm text-slate-600 mb-4">
            Assigning: <span className="font-semibold">{displayName} - {displaySub}</span>
          </p>
        )}
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {users.map((user) => (
            <label
              key={user.uid}
              className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                selectedUids.includes(user.uid) ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white ${
                selectedUids.includes(user.uid) ? "bg-emerald-600" : "bg-slate-300"
              }`}>
                {selectedUids.includes(user.uid) ? <Check className="h-4 w-4" /> : (user.displayName || user.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{user.displayName || user.email || user.uid}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <input type="checkbox" className="sr-only" checked={selectedUids.includes(user.uid)}
                onChange={() => toggleUid(user.uid)} />
            </label>
          ))}
        </div>
        <div className="flex gap-3 pt-2 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onAssign(methodId, selectedUids)}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: activeColor }}>
            Assign to {selectedUids.length} users
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight = false }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="shrink-0 text-slate-500">{label}:</span>
      <span className={`truncate font-medium ${highlight ? "text-amber-600" : "text-slate-900"}`}>{value}</span>
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
