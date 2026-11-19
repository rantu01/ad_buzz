"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  KeyRound,
  Maximize2,
  Paperclip,
  Share2,
  Wallet,
  Wrench,
  X,
  AlertCircle,
} from "lucide-react";

const CATEGORIES = [
  { key: "Account Restriction", icon: Ban },
  { key: "Pricing Queries", icon: CircleHelp },
  { key: "Ad Account Consultation", icon: Share2 },
  { key: "Meta Account Setup", icon: Wrench },
  { key: "Technical Errors", icon: AlertCircle },
  { key: "Wallet / Top-up Issue", icon: Wallet },
  { key: "Payment Issue", icon: CreditCard },
  { key: "Business Profile Issue", icon: BriefcaseBusiness },
  { key: "Billing / Spend Discrepancy", icon: ChartNoAxesCombined },
  { key: "Document / Verification Issue", icon: FileText },
  { key: "Account/Portal Access Issue", icon: KeyRound },
  { key: "General / Others", icon: CircleHelp },
];

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function accountLabel(acc) {
  const name = acc?.metaAccountName || acc?.name || "Ad Account";
  const id = (acc?.metaAccountId || acc?.accountId || "").replace(/^act_/, "");
  return id ? `${name} (ID: ${id})` : name;
}

export default function NewTicketModal({ open, onClose, user, adAccounts = [], onCreated }) {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("");
  const [accountRows, setAccountRows] = useState([""]);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setStep(1);
      setCategory("");
      setAccountRows([""]);
      setDescription("");
      setFiles([]);
      setErrors({});
      setSubmitting(false);
      setUploadProgress(0);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const selectedAccountIds = accountRows.filter(Boolean);
  const hasAccounts = adAccounts.length > 0;

  const toggleCategory = (key) => {
    setCategory(key);
    setErrors((e) => ({ ...e, category: "" }));
  };

  const addAccountRow = () => setAccountRows((prev) => [...prev, ""]);
  const removeAccountRow = (i) =>
    setAccountRows((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));
  const updateAccountRow = (i, val) => {
    setAccountRows((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  };

  const handleFiles = (fileList) => {
    const next = [...files];
    for (const f of Array.from(fileList || [])) {
      const type = (f.type || "").toLowerCase();
      if (!ALLOWED_TYPES.includes(type)) {
        Swal.fire("Invalid File", "Only JPG, PNG and PDF files are allowed.", "warning");
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        Swal.fire("File Too Large", "Maximum file size is 10 MB.", "warning");
        continue;
      }
      next.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, file: f, name: f.name, size: f.size, type: f.type });
    }
    setFiles(next);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const goNextFromStep1 = () => {
    if (!category) {
      setErrors((e) => ({ ...e, category: "Please select a subject." }));
      return;
    }
    setStep(2);
  };

  const goNextFromStep2 = () => {
    const nextErrors = {};
    if (!description.trim()) nextErrors.description = "Please describe the issue.";
    // duplicate account check
    const seen = new Set();
    let dup = false;
    for (const v of accountRows) {
      if (!v) continue;
      if (seen.has(v)) { dup = true; break; }
      seen.add(v);
    }
    if (dup) nextErrors.accounts = "Duplicate ad account selection is not allowed.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setStep(3);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setUploadProgress(0);
    try {
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fd = new FormData();
        fd.append("uid", user.uid);
        fd.append("file", f.file);
        const res = await fetch("/api/support-tickets/attachments", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Upload failed");
        uploaded.push(data.attachment);
        setUploadProgress(Math.round(((i + 1) / Math.max(files.length, 1)) * 100));
      }

      const selectedIds = accountRows.filter(Boolean);
      const res = await fetch("/api/user/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          customerName: user.displayName || user.email?.split("@")[0] || "",
          subject: category,
          category,
          message: description.trim(),
          adAccountIds: selectedIds,
          attachments: uploaded,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create ticket.");

      if (onCreated) onCreated(data.ticket);
      Swal.fire({
        icon: "success",
        title: "Ticket Created",
        text: `Your ticket ${data.ticket.ticketId} has been submitted.`,
        timer: 2000,
        showConfirmButton: false,
      });
      onClose();
    } catch (err) {
      Swal.fire("Error", err.message || "Something went wrong.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const progressSegments = [1, 2, 3];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <CircleHelp size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">AdsFixer LLC Support</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Online · we usually reply in a few minutes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Expand">
              <Maximize2 size={16} />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 && (
            <>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Select a Ticket Subject</h2>
              <p className="mb-4 text-sm text-slate-500">Choose the category that best describes your issue.</p>
              <div className="space-y-2">
                {CATEGORIES.map(({ key, icon: Icon }) => {
                  const selected = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCategory(key)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selected ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Icon size={18} />
                      </span>
                      <span className="flex-1 text-sm font-medium text-slate-800">{key}</span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </button>
                  );
                })}
              </div>
              {errors.category && <p className="mt-2 text-xs text-red-500">{errors.category}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AdsFixer LLC Support</p>
                <p className="text-xs text-slate-500">Online · we usually reply in a few minutes</p>
                <h2 className="mt-2 text-lg font-bold text-slate-900">New Ticket</h2>
                <p className="text-sm text-slate-500">
                  {category} · tell us what happened
                </p>
                <p className="mt-1 text-xs font-medium text-slate-400">Step 2 of 3</p>
              </div>

              {/* Progress */}
              <div className="mb-5 flex gap-2">
                {progressSegments.map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 flex-1 rounded-full ${s <= 2 ? "bg-amber-400" : "bg-slate-200"}`}
                  />
                ))}
              </div>

              {/* Ad accounts */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Ad account</label>
                <div className="space-y-2">
                  {accountRows.map((val, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={val}
                        onChange={(e) => updateAccountRow(i, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                      >
                        <option value="">Select your ad account</option>
                        {adAccounts.map((a) => {
                          const duplicate = accountRows.some((v, idx) => idx !== i && v === a._id);
                          return (
                            <option key={a._id} value={a._id} disabled={duplicate}>
                              {accountLabel(a)}
                            </option>
                          );
                        })}
                      </select>
                      {accountRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAccountRow(i)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                          aria-label="Remove"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addAccountRow}
                  className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-700"
                >
                  + Add another
                </button>
                {errors.accounts && <p className="mt-1 text-xs text-red-500">{errors.accounts}</p>}
                {hasAccounts === false && (
                  <p className="mt-1 text-xs text-slate-400">No ad accounts available.</p>
                )}
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Describe the issue</label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setErrors((er) => ({ ...er, description: "" }));
                  }}
                  rows={6}
                  placeholder="What happened?"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                />
                <div className="mt-1 flex items-center justify-between">
                  {errors.description ? <p className="text-xs text-red-500">{errors.description}</p> : <span />}
                  <p className="text-xs text-slate-400">{description.length}/2000</p>
                </div>
              </div>

              {/* Attachments */}
              <div className="mb-2">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Attachments Optional</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:bg-slate-100"
                >
                  <Paperclip size={20} className="mb-2 text-slate-500" />
                  <p className="text-sm font-medium text-slate-700">Attach file</p>
                  <p className="text-xs text-slate-400">JPG, PNG or PDF · up to 10 MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {files.map((f) => (
                      <li key={f.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        <span className="truncate text-slate-700">{f.name} <span className="text-xs text-slate-400">({Math.round(f.size / 1024)} KB)</span></span>
                        <button type="button" onClick={() => removeFile(f.id)} className="text-slate-400 hover:text-red-500">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AdsFixer LLC Support</p>
                <h2 className="mt-2 text-lg font-bold text-slate-900">Review Ticket</h2>
                <p className="text-sm text-slate-500">Step 3 of 3</p>
              </div>
              <div className="mb-5 flex gap-2">
                {progressSegments.map((s) => (
                  <div key={s} className="h-1.5 flex-1 rounded-full bg-amber-400" />
                ))}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
                  <p className="text-slate-800">{category}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ad accounts</p>
                  <p className="text-slate-800">
                    {selectedAccountIds.length === 0
                      ? "None"
                      : selectedAccountIds
                          .map((id) => adAccounts.find((a) => a._id === id))
                          .filter(Boolean)
                          .map((a) => accountLabel(a))
                          .join(", ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Description</p>
                  <p className="whitespace-pre-wrap text-slate-800">{description}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Attachments</p>
                  {files.length === 0 ? (
                    <p className="text-slate-800">None</p>
                  ) : (
                    <ul className="list-disc pl-5 text-slate-800">
                      {files.map((f) => (
                        <li key={f.id}>{f.name} ({Math.round(f.size / 1024)} KB)</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {submitting && files.length > 0 && (
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-amber-400 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Uploading... {uploadProgress}%</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => s - 1);
            }}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowLeft size={14} /> Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={step === 1 ? goNextFromStep1 : goNextFromStep2}
              disabled={submitting}
              className="inline-flex items-center gap-1 rounded-xl bg-[#F59E0B] px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] disabled:opacity-50"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1 rounded-xl bg-[#F59E0B] px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}