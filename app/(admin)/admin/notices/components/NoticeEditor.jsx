"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  ArrowLeft,
  Bold,
  CalendarClock,
  Check,
  Eye,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Loader2,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  UserSearch,
  X,
} from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import NoticeContent from "@/app/Component/Notices/NoticeContent";
import {
  CHANGE_KINDS,
  CHANGE_KIND_LABELS,
  COMPANY_NAME,
  NOTICE_PRIORITIES,
  NOTICE_TYPES,
  formatNoticeDate,
} from "@/lib/noticeConstants";

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyChange() {
  return { accountName: "", identifier: "", previousRate: "", newRate: "", rateUnit: "৳" };
}

export default function NoticeEditor({ initial = null, revisionOf = null }) {
  const router = useRouter();
  const { user } = useAuth();
  const editorRef = useRef(null);
  const requestId = useRef(0);
  const saveInFlightRef = useRef(false);

  const published = initial?.status === "published";
  const archived = initial?.status === "archived";
  const locked = published || archived;
  const isEdit = Boolean(initial?._id);

  const [title, setTitle] = useState(initial?.title || "");
  const [type, setType] = useState(initial?.type || "General Announcement");
  const [priority, setPriority] = useState(initial?.priority || "normal");
  const [audienceType, setAudienceType] = useState(initial?.audienceType || "all");
  const [selectedCustomers, setSelectedCustomers] = useState(
    (initial?.targetCustomerDetails || []).map((c) => ({ ...c }))
  );
  const [message, setMessage] = useState(initial?.message || "");
  const [changeKind, setChangeKind] = useState(initial?.changeKind || "rate");
  const [structuredChanges, setStructuredChanges] = useState(
    Array.isArray(initial?.structuredChanges) && initial.structuredChanges.length ? initial.structuredChanges : []
  );
  const [effectiveAt, setEffectiveAt] = useState(toLocalInput(initial?.effectiveAt));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(initial?.expiresAt));
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(initial?.scheduledAt));
  const [requireAcknowledgement, setRequireAcknowledgement] = useState(Boolean(initial?.requireAcknowledgement));
  const [preview, setPreview] = useState(false);
  const [savingAction, setSavingAction] = useState("");

  const [query, setQuery] = useState("");
  const [rawResults, setRawResults] = useState([]);
  const [searchedTerm, setSearchedTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const searching = Boolean(query.trim() && query.trim() !== searchedTerm);
  const results = query.trim() && !searching && query.trim() === searchedTerm ? rawResults : [];

  useEffect(() => {
    if (editorRef.current && message && editorRef.current.innerHTML !== message) {
      editorRef.current.innerHTML = message;
    }
  }, [message, preview]);

  useEffect(() => {
    if (!user?.uid || audienceType !== "individual" || locked) return undefined;
    const term = query.trim();
    if (!term) return undefined;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearchError("");
      try {
        const res = await authFetch(`/api/admin/notices/customers?q=${encodeURIComponent(term)}&limit=20`, {}, user);
        const data = await res.json().catch(() => ({}));
        if (id !== requestId.current) return;
        if (!res.ok || !data.success) {
          setSearchError(data.message || "Customer search failed. Please try again.");
          setRawResults([]);
          return;
        }
        setRawResults(data.customers || []);
      } catch {
        if (id === requestId.current) {
          setSearchError("Could not reach the server. Check your connection and try again.");
          setRawResults([]);
        }
      } finally {
        if (id === requestId.current) setSearchedTerm(term);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, audienceType, user, locked]);

  const exec = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    if (editorRef.current) setMessage(editorRef.current.innerHTML);
  };

  const insertLink = () => {
    const url = window.prompt("Enter URL (https://...)");
    if (url) exec("createLink", url);
  };

  const customerKey = (c) => c.mongoId || c.uid;
  const addCustomer = (customer) => {
    if (selectedCustomers.some((c) => customerKey(c) === customerKey(customer) || (c.uid && c.uid === customer.uid))) return;
    setSelectedCustomers((prev) => [...prev, customer]);
  };

  const updateChange = (index, field, value) => {
    setStructuredChanges((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const buildPayload = (status, action = null) => {
    // Published notices only accept safe fields; sending the full form would
    // trip the server's protected-field guard.
    if (published) return { id: initial?._id, priority, expiresAt: expiresAt || null };
    const base = {
      title,
      message,
      type,
      priority,
      audienceType,
      // Send actual MongoDB _ids; the API resolves them to auth uids server-side.
      targetCustomerIds: audienceType === "individual" ? selectedCustomers.map(customerKey) : [],
      changeKind: structuredChanges.length > 0 ? changeKind : null,
      structuredChanges,
      effectiveAt: effectiveAt || null,
      expiresAt: expiresAt || null,
      scheduledAt: scheduledAt || null,
      requireAcknowledgement,
      revisionOf,
    };
    if (action) {
      // A brand-new notice is created by POST, which honours `status` only —
      // the `action` field is handled by PATCH. Without this the "Publish
      // Now" / "Schedule" buttons silently produced drafts.
      const actionStatus = action === "publish" ? "published" : action === "schedule" ? "scheduled" : null;
      return {
        ...base,
        ...(isEdit ? {} : { status: actionStatus }),
        action,
        scheduledAt: scheduledAt || null,
        id: initial?._id,
      };
    }
    if (!locked) base.status = status;
    return base;
  };

  const save = async (status, action = null) => {
    if (!user?.uid || saveInFlightRef.current) return;
    if (!title.trim()) {
      Swal.fire("Title required", "Please enter a notice title.", "warning");
      return;
    }
    if (!locked && !message.replace(/<[^>]*>/g, "").trim()) {
      Swal.fire("Message required", "Please write the notice message.", "warning");
      return;
    }
    if (audienceType === "individual" && selectedCustomers.length === 0 && !locked) {
      Swal.fire("Select customers", "Choose at least one customer for an individual notice.", "warning");
      return;
    }
    const actionKey = action || status || "safe";
    saveInFlightRef.current = true;
    setSavingAction(actionKey);
    try {
      const payload = buildPayload(status, action);
      const url = isEdit ? `/api/admin/notices/${initial._id}` : "/api/admin/notices";
      const res = await authFetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, user);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save notice");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: data.message || "Notice saved",
        timer: 2500,
        showConfirmButton: false,
      });
      router.push("/admin/notices");
      router.refresh();
    } catch (error) {
      Swal.fire("Error", error.message || "Failed to save notice", "error");
    } finally {
      saveInFlightRef.current = false;
      setSavingAction("");
    }
  };

  const previewNotice = {
    title,
    message,
    type,
    priority,
    effectiveAt,
    company: COMPANY_NAME,
    changeKind,
    structuredChanges,
    publishedAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/notices")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Back to notices"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              {archived ? "Notice Details" : isEdit ? "Edit Notice" : revisionOf ? "Create Revision" : "Create Notice"}
            </h1>
            <p className="text-sm text-slate-500">
              {locked
                ? "Published content is locked to protect what customers have already read."
                : "Compose and deliver an official Ads Buzz announcement."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Eye size={16} /> {preview ? "Hide Preview" : "Preview"}
        </button>
      </div>

      {revisionOf ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          This is a new revision. Publishing it creates a separate notice; the original stays unchanged for customers who already acknowledged it.
        </div>
      ) : null}

      {locked ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          Status: <strong>{initial?.status}</strong>
          {initial?.publishedAt ? ` · Published ${formatNoticeDate(initial.publishedAt, true)}` : ""}
          {published ? " · You may extend the expiry date or change priority only." : " · Archived notices are read-only."}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Notice Title *</label>
            <input
              value={title}
              disabled={locked}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Your ad account rate has changed"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50"
            />

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Notice Type</label>
                <select
                  value={type}
                  disabled={locked}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50"
                >
                  {NOTICE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary/30"
                >
                  {NOTICE_PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Message *</label>
              <p className="mb-2 text-[11px] text-slate-400">Bengali and English are supported. Format with the tools below.</p>
              <div className="mb-2 flex flex-wrap gap-1 rounded-t-xl border border-slate-200 bg-slate-50 p-2">
                <button type="button" disabled={locked} onClick={() => exec("bold")} title="Bold" className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40"><Bold size={16} /></button>
                <button type="button" disabled={locked} onClick={() => exec("formatBlock", "p")} title="Paragraph" className="rounded p-1.5 text-xs font-bold hover:bg-slate-200 disabled:opacity-40">P</button>
                <button type="button" disabled={locked} onClick={() => exec("formatBlock", "h1")} title="Heading 1" className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40"><Heading1 size={16} /></button>
                <button type="button" disabled={locked} onClick={() => exec("formatBlock", "h2")} title="Heading 2" className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40"><Heading2 size={16} /></button>
                <button type="button" disabled={locked} onClick={() => exec("insertUnorderedList")} title="Bullet list" className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40"><List size={16} /></button>
                <button type="button" disabled={locked} onClick={() => exec("insertOrderedList")} title="Numbered list" className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40"><ListOrdered size={16} /></button>
                <button type="button" disabled={locked} onClick={insertLink} title="Link" className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40"><LinkIcon size={16} /></button>
              </div>
              <div
                ref={editorRef}
                contentEditable={!locked}
                suppressContentEditableWarning
                onInput={() => { if (editorRef.current) setMessage(editorRef.current.innerHTML); }}
                className="min-h-[260px] rounded-b-xl border border-slate-200 bg-white p-4 text-sm outline-none focus:ring-2 focus:ring-secondary/30"
                style={{ whiteSpace: "pre-wrap" }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Structured Change List</h2>
                <p className="text-[11px] text-slate-500">
                  For rate, package, commission or policy announcements. Notification only — no account data is modified.
                </p>
              </div>
              {!locked ? (
                <button
                  type="button"
                  onClick={() => setStructuredChanges((prev) => [...prev, emptyChange()])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={14} /> Add entry
                </button>
              ) : null}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Change category</label>
              <select
                value={changeKind}
                disabled={locked}
                onChange={(e) => setChangeKind(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
              >
                {CHANGE_KINDS.map((kind) => <option key={kind} value={kind}>{CHANGE_KIND_LABELS[kind]}</option>)}
              </select>
            </div>

            {structuredChanges.length === 0 ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">No change entries added.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {structuredChanges.map((row, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Entry {index + 1}</span>
                      {!locked ? (
                        <button
                          type="button"
                          onClick={() => setStructuredChanges((prev) => prev.filter((_, i) => i !== index))}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input value={row.accountName} disabled={locked} onChange={(e) => updateChange(index, "accountName", e.target.value)} placeholder="Account name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
                      <input value={row.identifier} disabled={locked} onChange={(e) => updateChange(index, "identifier", e.target.value)} placeholder="••9168 (masked id)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
                      <input value={row.previousRate} disabled={locked} onChange={(e) => updateChange(index, "previousRate", e.target.value)} placeholder="Previous (৳130)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
                      <div className="flex gap-2">
                        <input value={row.newRate} disabled={locked} onChange={(e) => updateChange(index, "newRate", e.target.value)} placeholder="New (৳133)" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
                        <input value={row.rateUnit} disabled={locked} onChange={(e) => updateChange(index, "rateUnit", e.target.value)} placeholder="৳" className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Target Audience *</h2>
            <div className="space-y-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => setAudienceType("all")}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                  audienceType === "all" ? "border-[#F48E2B] bg-orange-50/60 ring-1 ring-[#F48E2B]/30" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Users size={18} className="mt-0.5 shrink-0 text-[#C2410C]" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">All Customers</span>
                  <span className="block text-[11px] text-slate-500">One central notice for every registered customer.</span>
                </span>
                {audienceType === "all" ? <Check size={16} className="ml-auto shrink-0 text-[#C2410C]" /> : null}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => setAudienceType("individual")}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                  audienceType === "individual" ? "border-[#F48E2B] bg-orange-50/60 ring-1 ring-[#F48E2B]/30" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <UserSearch size={18} className="mt-0.5 shrink-0 text-[#C2410C]" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Individual Customers</span>
                  <span className="block text-[11px] text-slate-500">Search and select one or more customers.</span>
                </span>
                {audienceType === "individual" ? <Check size={16} className="ml-auto shrink-0 text-[#C2410C]" /> : null}
              </button>
            </div>

            {audienceType === "individual" && !locked ? (
              <div className="mt-4">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name, email, customer ID…"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-secondary/30"
                  />
                </div>
                {searching ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500" role="status">
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Loading customers…
                  </p>
                ) : null}
                {searchError ? <p className="mt-1 text-[11px] font-medium text-red-600">{searchError}</p> : null}
                {!query.trim() ? (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                    Type a name, email or customer ID to find customers.
                  </p>
                ) : null}
                {searchedTerm === query.trim() && !searchError && results.length === 0 ? (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                    No customers found for “{query.trim()}”.
                  </p>
                ) : null}
                {results.length > 0 ? (
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {results.map((customer) => {
                      const selected = selectedCustomers.some((c) => customerKey(c) === customerKey(customer));
                      return (
                        <button
                          key={customer.mongoId || customer.uid}
                          type="button"
                          onClick={() => addCustomer(customer)}
                          className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800">{customer.displayName || "Unnamed customer"}</span>
                            <span className="block truncate text-[11px] font-medium text-[#C2410C]">{customer.email}</span>
                            <span className="block truncate text-[10px] text-slate-500">
                              {customer.customId || customer.mongoId}
                            </span>
                          </span>
                          {selected ? <Check size={14} className="shrink-0 text-emerald-600" /> : <Plus size={14} className="shrink-0 text-slate-400" />}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {selectedCustomers.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Selected ({selectedCustomers.length})</p>
                    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                      {selectedCustomers.map((customer) => (
                        <span key={customerKey(customer)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold text-[#9A3412]">
                          <span className="truncate" title={customer.email}>{customer.email || customer.displayName || customerKey(customer)}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomers((prev) => prev.filter((c) => customerKey(c) !== customerKey(customer)))}
                            aria-label={`Remove ${customer.email || "customer"}`}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {audienceType === "individual" && locked ? (
              <p className="mt-3 text-xs text-slate-500">{initial?.targetCustomerDetails?.length || 0} recipient(s)</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Scheduling &amp; Validity</h2>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Effective Date &amp; Time (optional)</label>
              <input type="datetime-local" value={effectiveAt} disabled={locked} onChange={(e) => setEffectiveAt(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
              <p className="mt-1 text-[10px] text-slate-400">When the information takes effect — separate from when it is published.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Expiry Date &amp; Time (optional)</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Publish At (for scheduling)</label>
              <input type="datetime-local" value={scheduledAt} disabled={locked} onChange={(e) => setScheduledAt(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-slate-50" />
            </div>
            <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={requireAcknowledgement}
                disabled={locked}
                onChange={(e) => setRequireAcknowledgement(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#F48E2B]"
              />
              <span>
                <span className="block text-xs font-semibold text-slate-700">Require acknowledgement</span>
                <span className="block text-[10px] text-slate-500">Customers must confirm they have read this notice.</span>
              </span>
            </label>
          </div>

          <div className="space-y-2">
            {archived ? (
              <button
                type="button"
                onClick={() => router.push(`/admin/notices/new?revisionOf=${initial._id}`)}
                className="w-full rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706]"
              >
                Create Revision
              </button>
            ) : published ? (
              <>
                <button
                  type="button"
                  disabled={Boolean(savingAction)}
                  onClick={() => save(null)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAction === "safe" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} />}
                  {savingAction === "safe" ? "Saving…" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/admin/notices/new?revisionOf=${initial._id}`)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Create Revision
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={Boolean(savingAction)}
                  onClick={() => save("draft")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAction === "draft" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} />}
                  {savingAction === "draft" ? "Saving…" : "Save as Draft"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(savingAction)}
                  onClick={() => save(null, "schedule")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAction === "schedule" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CalendarClock size={16} />}
                  {savingAction === "schedule" ? "Scheduling…" : "Schedule"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(savingAction)}
                  onClick={() => save(null, "publish")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAction === "publish" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} />}
                  {savingAction === "publish" ? "Publishing…" : "Publish Now"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm" onClick={() => setPreview(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notice preview"
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{title || "Untitled notice"}</h3>
                <p className="text-[11px] text-slate-500">{COMPANY_NAME} · Preview</p>
              </div>
              <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Audience</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800">
                  {audienceType === "all" ? "All customers" : `${selectedCustomers.length} selected customer(s)`}
                </p>
                {audienceType === "individual" && selectedCustomers.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {selectedCustomers.map((customer) => (
                      <li key={customerKey(customer)} className="truncate text-[11px] text-slate-600" title={customer.email}>
                        {customer.displayName || "Customer"} · <span className="font-medium text-[#C2410C]">{customer.email}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <NoticeContent notice={previewNotice} />
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              {requireAcknowledgement ? "Customers must confirm this notice before they can continue." : "Customers can close this notice directly."}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
