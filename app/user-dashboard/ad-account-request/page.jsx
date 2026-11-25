"use client";

/* eslint-disable react-hooks/set-state-in-effect */
// Data-loading effects follow the same pattern as the existing dashboard
// pages: loading flags are set synchronously, then resolved asynchronously.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useUserAlerts } from "../components/UserAlertProvider";
import { authFetch, authJson } from "@/lib/authFetch";
import { validateRequestPayload, validateCustomerInfo, STATUS_LABELS, STATUS_STYLES, statusLabel } from "@/lib/adAccountRequestConstants";
import { formatDateTime } from "@/lib/dateFormat";
import Pagination from "@/app/Component/Pagination";
import Swal from "sweetalert2";
import { Loader2, Send, FilePlus2, Eye, X, AlertCircle, ExternalLink, RefreshCw, ArrowUpRight, ChevronLeft, ChevronDown, Plus, Layers } from "lucide-react";

const EMPTY_FORM = {
  platform: "",
  adAccountName: "",
  monthlyBudget: "",
  product: "",
  businessManagerId: "",
  websitePageLink: "",
};

const FIELD_ORDER = ["platform", "adAccountName", "monthlyBudget", "product", "businessManagerId", "websitePageLink"];

function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {statusLabel(status)}
    </span>
  );
}

// Compact field styling matching the request-composer reference: small
// labels, tightly spaced inputs, hairline borders and a single accent.
function FormField({ id, label, error, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[10px] font-medium text-slate-600">{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-600" role="alert">
          <AlertCircle size={11} aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}

function compactInput(error) {
  return `h-[30px] w-full rounded-md border bg-white px-2.5 text-[11px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#E24B0B] focus:ring-2 focus:ring-[#E24B0B]/10 ${error ? "border-rose-400" : "border-[#D9D9E3] hover:border-[#C2C2D0]"}`;
}

const toolbarButton = "inline-flex h-[28px] items-center gap-1 rounded-md border border-[#DCDCE5] bg-white px-2.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#E24B0B]";

const submitButton = "inline-flex h-[28px] items-center gap-1 rounded-md bg-[#E24B0B] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#C93F08] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9A3207] disabled:cursor-wait disabled:opacity-60";

export default function AdAccountRequestPage() {
  const { user, loading: authLoading } = useAuth();
  const { notifSeq } = useUserAlerts();
  const router = useRouter();

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [platformsError, setPlatformsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const [requests, setRequests] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [infoText, setInfoText] = useState("");
  const [infoError, setInfoError] = useState("");
  const [infoSubmitting, setInfoSubmitting] = useState(false);
  const dialogRef = useRef(null);
  const dialogTitleRef = useRef(null);
  const formRef = useRef(null);

  const loadPlatforms = useCallback(async () => {
    if (!user?.uid) return;
    setPlatformsLoading(true);
    setPlatformsError("");
    try {
      const { ok, data } = await authJson("/api/ad-account-requests/platforms", {}, user);
      if (!ok || !data.success) throw new Error(data.message || "Unable to load platforms.");
      setPlatforms(data.platforms || []);
    } catch (error) {
      setPlatformsError(error.message || "Unable to load platforms.");
    } finally {
      setPlatformsLoading(false);
    }
  }, [user]);

  const loadRequests = useCallback(async (targetPage = page) => {
    if (!user?.uid) return;
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: "10" });
      const { ok, data } = await authJson(`/api/user/ad-account-requests?${params}`, {}, user);
      if (!ok || !data.success) throw new Error(data.message || "Unable to load your requests.");
      setRequests(data.requests || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      setListError(error.message || "Unable to load your requests.");
    } finally {
      setListLoading(false);
    }
  }, [user, page]);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);
  useEffect(() => { loadRequests(page); }, [page, reloadKey, loadRequests]);
  // Live status updates: a notification about this request refreshes the list.
  useEffect(() => {
    if (notifSeq > 0) loadRequests(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifSeq]);

  // Notification deep-link: open the exact referenced request once.
  useEffect(() => {
    if (!user?.uid) return;
    let id = null;
    try { id = window.sessionStorage.getItem("ab_open_ad_request"); } catch { /* ignore */ }
    if (!id) return;
    try { window.sessionStorage.removeItem("ab_open_ad_request"); } catch { /* ignore */ }
    (async () => {
      const { ok, data } = await authJson(`/api/user/ad-account-requests?id=${encodeURIComponent(id)}`, {}, user);
      if (ok && data.success && data.request) {
        setSelected(data.request);
        setInfoText("");
        setInfoError("");
      }
    })();
  }, [user, reloadKey]);

  useEffect(() => {
    if (!selected || !dialogRef.current) return;
    if (!dialogRef.current.open) dialogRef.current.showModal();
    dialogTitleRef.current?.focus();
  }, [selected]);

  const changeField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        const check = validateRequestPayload({ ...form, [field]: value });
        if (check.ok || !check.errors[field]) delete next[field];
        return next;
      });
    }
  };

  const blurField = (field) => {
    const check = validateRequestPayload(form);
    if (check.errors[field]) setErrors((prev) => ({ ...prev, [field]: check.errors[field] }));
  };

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setNotice("");
    setShowMoreOptions(false);
  };

  const handleAddAnother = () => {
    clearForm();
    setTimeout(() => document.getElementById("aar-platform")?.focus(), 0);
  };

  const handleCancel = async () => {
    const result = await Swal.fire({
      title: "Discard this request?",
      text: "Your entries will be cleared and you will return to the dashboard.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Discard request",
      cancelButtonText: "Keep editing",
      confirmButtonColor: "#E24B0B",
      focusCancel: true,
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    clearForm();
    router.push("/user-dashboard");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setNotice("");

    const check = validateRequestPayload(form);
    if (!check.ok) {
      setErrors(check.errors);
      // The website link lives under "More options" — reveal it so the
      // highlighted field and its error are actually visible.
      if (check.errors.websitePageLink) setShowMoreOptions(true);
      Swal.fire({ icon: "warning", title: "Check the highlighted fields", timer: 1800, showConfirmButton: false });
      setTimeout(() => document.getElementById(`aar-${FIELD_ORDER.find((f) => check.errors[f])}`)?.focus(), 60);
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(
        "/api/user/ad-account-requests",
        { method: "POST", body: JSON.stringify(form) },
        user
      );
      const data = await res.json().catch(() => ({}));
      const ok = res.ok;
      if (!ok || !data.success) {
        if (data.errors) setErrors(data.errors);
        throw new Error(data.message || "Your request could not be submitted.");
      }
      setForm(EMPTY_FORM);
      setErrors({});
      setShowMoreOptions(false);
      setPage(1);
      setReloadKey((k) => k + 1);
      setNotice("Your request was submitted successfully.");
      await Swal.fire({ icon: "success", title: "Request submitted", text: "Our team will review it shortly.", timer: 1800, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: "error", title: "Submission failed", text: error.message || "Please try again.", confirmButtonColor: "#F59E0B" });
    } finally {
      setSubmitting(false);
    }
  };

  const openDetails = async (request) => {
    setSelected(request);
    setInfoText("");
    setInfoError("");
    setDetailLoading(true);
    try {
      const { ok, data } = await authJson(`/api/user/ad-account-requests?id=${encodeURIComponent(request._id)}`, {}, user);
      if (ok && data.success && data.request) {
        setSelected(data.request);
        setInfoText("");
        setInfoError("");
      }
    } catch { /* keep the row already on screen */ }
    finally { setDetailLoading(false); }
  };

  const closeDetails = () => {
    dialogRef.current?.close();
    setSelected(null);
    setInfoError("");
  };

  const submitInfo = async (event) => {
    event.preventDefault();
    if (infoSubmitting || !selected) return;
    const check = validateCustomerInfo({ message: infoText });
    if (!check.ok) {
      setInfoError(check.errors.message);
      return;
    }
    setInfoSubmitting(true);
    setInfoError("");
    try {
      const { ok, data } = await authJson("/api/user/ad-account-requests", {
        method: "PATCH",
        body: JSON.stringify({ id: selected._id, message: check.value.message }),
      }, user);
      if (!ok || !data.success) throw new Error(data.message || "Unable to send the information.");
      setSelected(data.request);
      setInfoText("");
      setReloadKey((k) => k + 1);
      setNotice("Your information was sent for review.");
      Swal.fire({ target: dialogRef.current || undefined, icon: "success", title: "Information sent", timer: 1500, showConfirmButton: false });
    } catch (error) {
      setInfoError(error.message || "Unable to send the information.");
    } finally {
      setInfoSubmitting(false);
    }
  };

  if (authLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-600" role="status"><Loader2 className="mr-2 animate-spin" size={18} /> Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="sr-only">{notice}</div>

      {/* Breadcrumb + composer actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[13px] font-semibold text-slate-800">
          <Link href="/user-dashboard" className="inline-flex items-center gap-1 rounded-md px-1 py-1 transition hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#E24B0B]">
            <ChevronLeft size={15} aria-hidden="true" /> Request Ad Account
          </Link>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={handleAddAnother} className={toolbarButton}>
            <Plus size={13} aria-hidden="true" /> Add another request
          </button>
          <button type="button" disabled title="Bulk requests are not available" className={`${toolbarButton} disabled:cursor-not-allowed disabled:opacity-60`}>
            <Layers size={13} aria-hidden="true" /> Bulk
          </button>
          <button type="button" onClick={handleCancel} className={toolbarButton}>Cancel</button>
          <button type="submit" form="ad-account-request-form" disabled={submitting} aria-busy={submitting} className={submitButton}>
            {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>

      {/* Request composer */}
      <form id="ad-account-request-form" ref={formRef} onSubmit={handleSubmit} noValidate className="overflow-hidden rounded-xl border border-[#E4E4EC] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDEDF3] px-4 py-2.5">
          <h2 className="text-[12px] font-bold text-slate-800">Ad account details</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 flex h-[14px] w-[14px] -translate-y-1/2 items-center justify-center rounded-full bg-[#0866FF] text-[8px] font-bold text-white" aria-hidden="true">
                {(form.platform || "M").charAt(0).toUpperCase()}
              </span>
              <select
                id="aar-platform"
                name="platform"
                value={form.platform}
                onChange={(e) => changeField("platform", e.target.value)}
                onBlur={() => blurField("platform")}
                className={`h-[28px] w-[122px] appearance-none rounded-md border bg-white pl-6 pr-6 text-[11px] font-medium text-slate-700 outline-none transition focus:border-[#E24B0B] focus:ring-2 focus:ring-[#E24B0B]/10 ${errors.platform ? "border-rose-400" : "border-[#D9D9E3]"}`}
                aria-invalid={!!errors.platform}
                aria-describedby={errors.platform ? "aar-platform-error" : undefined}
                required
              >
                <option value="">{platformsLoading ? "Loading…" : "Select platform"}</option>
                {platforms.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            </div>
            {errors.platform && <p id="aar-platform-error" className="text-[10px] font-medium text-rose-600" role="alert">{errors.platform}</p>}
          </div>
        </div>

        <div>
          <section className="grid grid-cols-1 gap-3 border-b border-[#EDEDF3] px-4 py-3 md:grid-cols-[104px_minmax(0,1fr)] md:gap-4">
            <h3 className="pt-0.5 text-[11px] font-bold text-slate-800">Account</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2">
              <div>
                <span className="mb-1 block text-[10px] font-medium text-slate-600">Account</span>
                <div className="flex h-[30px] items-center justify-between rounded-md border border-[#D9D9E3] bg-white px-2.5 text-[11px] text-slate-700" title={user?.email || "Your account"}>
                  <span className="truncate">{user?.displayName || user?.email || "My account"}</span>
                  <ChevronDown size={12} className="ml-2 shrink-0 text-slate-400" aria-hidden="true" />
                </div>
              </div>
              <FormField id="aar-adAccountName" label="Ad account name" error={errors.adAccountName}>
                <input
                  id="aar-adAccountName"
                  name="adAccountName"
                  type="text"
                  value={form.adAccountName}
                  onChange={(e) => changeField("adAccountName", e.target.value)}
                  onBlur={() => blurField("adAccountName")}
                  placeholder="Ad account name"
                  maxLength={200}
                  className={compactInput(errors.adAccountName)}
                  aria-invalid={!!errors.adAccountName}
                  aria-describedby={errors.adAccountName ? "aar-adAccountName-error" : undefined}
                  required
                />
              </FormField>
            </div>
            {platformsError && <p className="mt-2 text-[10px] text-rose-600 md:col-start-2">{platformsError} <button type="button" onClick={loadPlatforms} className="underline">Retry</button></p>}
            {!platformsLoading && !platformsError && platforms.length === 0 && (
              <p className="mt-2 text-[10px] text-slate-500 md:col-start-2">No active platforms are configured yet. Please contact support.</p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-3 border-b border-[#EDEDF3] px-4 py-3 md:grid-cols-[104px_minmax(0,1fr)] md:gap-4">
            <h3 className="pt-0.5 text-[11px] font-bold text-slate-800">Spend &amp; products</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-2">
              <FormField id="aar-monthlyBudget" label="Monthly budget (USD)" error={errors.monthlyBudget}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500" aria-hidden="true">$</span>
                  <input
                    id="aar-monthlyBudget"
                    name="monthlyBudget"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={form.monthlyBudget}
                    onChange={(e) => changeField("monthlyBudget", e.target.value)}
                    onBlur={() => blurField("monthlyBudget")}
                    placeholder="Monthly budget"
                    className={`${compactInput(errors.monthlyBudget)} pl-6`}
                    aria-invalid={!!errors.monthlyBudget}
                    aria-describedby={errors.monthlyBudget ? "aar-monthlyBudget-error" : undefined}
                    required
                  />
                </div>
              </FormField>
              <FormField id="aar-product" label="Products" error={errors.product}>
                <input
                  id="aar-product"
                  name="product"
                  type="text"
                  value={form.product}
                  onChange={(e) => changeField("product", e.target.value)}
                  onBlur={() => blurField("product")}
                  placeholder="Cotton T-shirt"
                  maxLength={300}
                  className={compactInput(errors.product)}
                  aria-invalid={!!errors.product}
                  aria-describedby={errors.product ? "aar-product-error" : undefined}
                  required
                />
              </FormField>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 border-b border-[#EDEDF3] px-4 py-3 md:grid-cols-[104px_minmax(0,1fr)] md:gap-4">
            <h3 className="pt-0.5 text-[11px] font-bold text-slate-800">Access</h3>
            <FormField id="aar-businessManagerId" label="Business Manager ID" error={errors.businessManagerId}>
              <div className={`flex h-[30px] overflow-hidden rounded-md border ${errors.businessManagerId ? "border-rose-400" : "border-[#D9D9E3]"}`}>
                <span className="flex w-[62px] shrink-0 items-center justify-between border-r border-[#D9D9E3] bg-[#FAFAFC] px-2 text-[10px] font-medium text-slate-600" aria-hidden="true">
                  BM ID <ChevronDown size={11} />
                </span>
                <input
                  id="aar-businessManagerId"
                  name="businessManagerId"
                  type="text"
                  value={form.businessManagerId}
                  onChange={(e) => changeField("businessManagerId", e.target.value)}
                  onBlur={() => blurField("businessManagerId")}
                  placeholder="Business Manager ID"
                  maxLength={100}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 text-[11px] text-slate-800 outline-none placeholder:text-slate-400"
                  aria-invalid={!!errors.businessManagerId}
                  aria-describedby={errors.businessManagerId ? "aar-businessManagerId-error" : undefined}
                  required
                />
              </div>
            </FormField>
          </section>

          <section className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[104px_minmax(0,1fr)] md:gap-4">
            <h3 className="pt-1 text-[11px] font-bold text-slate-800">More options</h3>
            <div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMoreOptions((value) => !value)}
                  aria-expanded={showMoreOptions}
                  aria-controls="aar-more-options-panel"
                  className={toolbarButton}
                >
                  {showMoreOptions ? "Done" : "Change"}
                </button>
              </div>
              {showMoreOptions && (
                <div id="aar-more-options-panel" className="mt-2">
                  <FormField id="aar-websitePageLink" label="Website / Page Link" error={errors.websitePageLink}>
                    <input
                      id="aar-websitePageLink"
                      name="websitePageLink"
                      type="url"
                      inputMode="url"
                      value={form.websitePageLink}
                      onChange={(e) => changeField("websitePageLink", e.target.value)}
                      onBlur={() => blurField("websitePageLink")}
                      placeholder="https://example.com or facebook.com/your-page"
                      maxLength={2000}
                      className={compactInput(errors.websitePageLink)}
                      aria-invalid={!!errors.websitePageLink}
                      aria-describedby={errors.websitePageLink ? "aar-websitePageLink-error" : undefined}
                      required
                    />
                  </FormField>
                </div>
              )}
            </div>
          </section>
        </div>
      </form>

      {/* Request history */}
      <section aria-labelledby="aar-history-title" className="overflow-hidden rounded-2xl border border-[#E5DED6] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div>
            <h2 id="aar-history-title" className="text-base font-semibold text-slate-900">My Ad Account Requests</h2>
            <p className="mt-0.5 text-xs text-slate-500">{total} request{total === 1 ? "" : "s"} submitted</p>
          </div>
          <button type="button" onClick={() => loadRequests(page)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-amber-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        </div>

        {listError ? (
          <div className="px-5 py-12 text-center" role="alert">
            <AlertCircle className="mx-auto text-rose-500" size={26} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-800">We couldn&apos;t load your requests.</p>
            <p className="mt-1 text-xs text-slate-500">{listError}</p>
            <button type="button" onClick={() => loadRequests(page)} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-amber-400">Try again</button>
          </div>
        ) : listLoading && requests.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500" role="status"><Loader2 className="animate-spin" size={18} aria-hidden="true" /> Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><FilePlus2 size={22} aria-hidden="true" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No requests yet</p>
            <p className="mt-1 text-xs text-slate-500">Fill in the form above to request your first ad account.</p>
            <button type="button" onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700">Go to request form</button>
          </div>
        ) : (
          <>
            {listLoading && <div className="h-0.5 w-full animate-pulse bg-amber-300" aria-hidden="true" />}
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-white">
                  <tr>
                    {["Platform", "Ad Account Name", "Monthly Budget", "Product", "Business Manager ID", "Website / Page Link", "Request Date", "Status", "Actions"].map((h) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((request) => (
                    <tr key={String(request._id)} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{request.platform}</td>
                      <td className="px-4 py-3 text-slate-700">{request.adAccountName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">${Number(request.monthlyBudget || 0).toFixed(2)}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-slate-700" title={request.product}>{request.product}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{request.businessManagerId}</td>
                      <td className="max-w-[200px] truncate px-4 py-3">
                        <a href={request.websitePageLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                          {request.websitePageLink?.replace(/^https?:\/\//, "")} <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(request.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusPill status={request.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button type="button" onClick={() => openDetails(request)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-amber-400 hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                          <Eye size={14} aria-hidden="true" /> View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-5 py-2">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </section>

      {/* Details dialog */}
      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        onClick={(event) => { if (event.target === dialogRef.current) closeDetails(); }}
        aria-labelledby="aar-detail-title"
        className="w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
      >
        {selected && (
          <div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <div>
                <h2 id="aar-detail-title" ref={dialogTitleRef} tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none">Request details</h2>
                <p className="mt-1 text-xs text-slate-500">Submitted {formatDateTime(selected.createdAt)}</p>
              </div>
              <button type="button" onClick={closeDetails} aria-label="Close request details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"><X size={18} /></button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
              {detailLoading && <div className="flex items-center gap-2 text-xs text-slate-500" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading full details…</div>}

              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-xs text-slate-500">Current status</p>
                  <div className="mt-2"><StatusPill status={selected.status} /></div>
                </div>
                <ArrowUpRight size={18} className="text-slate-300" aria-hidden="true" />
              </div>

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ["Platform", selected.platform],
                  ["Ad Account Name", selected.adAccountName],
                  ["Monthly Budget", `$${Number(selected.monthlyBudget || 0).toFixed(2)}`],
                  ["Product", selected.product],
                  ["Business Manager ID", selected.businessManagerId],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-slate-100 pb-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-slate-800">{value || "—"}</dd>
                  </div>
                ))}
                <div className="border-b border-slate-100 pb-2 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Website / Page Link</dt>
                  <dd className="mt-1 break-all text-sm">
                    <a className="text-amber-700 hover:underline" href={selected.websitePageLink} target="_blank" rel="noopener noreferrer">{selected.websitePageLink}</a>
                  </dd>
                </div>
              </dl>

              {selected.status === "more_info_required" && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <p className="text-sm font-semibold text-violet-900">Message from our team</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-violet-800">{selected.adminNote || "Please provide the requested information."}</p>
                  <form onSubmit={submitInfo} className="mt-4 space-y-2" noValidate>
                    <label htmlFor="aar-info" className="block text-xs font-semibold text-slate-700">Your response</label>
                    <textarea
                      id="aar-info"
                      rows={3}
                      value={infoText}
                      onChange={(e) => { setInfoText(e.target.value); if (infoError) setInfoError(""); }}
                      placeholder="Type the requested information here…"
                      aria-invalid={!!infoError}
                      aria-describedby={infoError ? "aar-info-error" : undefined}
                      className={`${inputClass(infoError)} resize-y`}
                    />
                    {infoError && <p id="aar-info-error" className="text-xs font-medium text-rose-600" role="alert">{infoError}</p>}
                    <button type="submit" disabled={infoSubmitting} aria-busy={infoSubmitting} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60">
                      {infoSubmitting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                      {infoSubmitting ? "Sending…" : "Send Information"}
                    </button>
                  </form>
                </div>
              )}

              {selected.status === "rejected" && selected.rejectionReason && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-rose-900">Reason for rejection</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-rose-800">{selected.rejectionReason}</p>
                </div>
              )}

              {selected.status === "approved" && selected.adminNote && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Note from our team</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-800">{selected.adminNote}</p>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Status history</h3>
                <ol className="space-y-3">
                  {(selected.statusHistory || []).map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{STATUS_LABELS[entry.status] || statusLabel(entry.status)}</p>
                        {entry.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-600">{entry.note}</p>}
                        {entry.reason && <p className="mt-0.5 text-xs text-rose-600">Reason: {entry.reason}</p>}
                        <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(entry.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-3">
              <button type="button" onClick={closeDetails} className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300">Close</button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
