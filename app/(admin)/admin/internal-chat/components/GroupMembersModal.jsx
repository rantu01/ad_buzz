"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Search, Users, X } from "lucide-react";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";
import { ROLE_LABELS } from "@/lib/rbacCatalog";

// Shared picker for creating a group and for adding members later. User data
// comes from the existing staff directory endpoint; no sample users are used.
export default function GroupMembersModal({ open, mode = "create", group, api, onClose, onSubmit }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null);
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const closeRef = useRef(null);

  const loadUsers = useCallback(async () => {
    if (!api) return;
    try {
      const data = await api(`/api/internal-chat/users?limit=100`);
      setUsers(Array.isArray(data.items || data.users) ? (data.items || data.users) : []);
    } catch {
      setUsers([]);
    }
  }, [api]);

  useEffect(() => {
    if (!open) return;
    // The modal is keyed by open state, so a fresh mount already has clean
    // form state; only the directory needs to be loaded asynchronously.
    queueMicrotask(() => loadUsers());
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, mode, loadUsers, onClose]);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const existingUids = useMemo(() => new Set((group?.participants || []).filter(Boolean)), [group]);
  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => !existingUids.has(u.uid)
      && (!term || `${u.displayName || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase().includes(term)));
  }, [users, search, existingUids]);

  const toggle = (uid) => setSelected((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);

  const submit = async () => {
    if (busy) return;
    if (!selected.length) { setError("Select at least one person."); return; }
    if (mode === "create" && !name.trim()) { setError("Enter a group name."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ name, description, memberUids: selected, photo });
      onClose();
    } catch (err) {
      setError(err.message || "Could not save group");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={mode === "create" ? "Create group" : "Add group members"} className="flex max-h-[min(90vh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Users size={18} className="text-orange-500" />{mode === "create" ? "Create group" : "Add members"}</h2>
            <p className="text-xs text-slate-500">{mode === "create" ? "Bring your team together in one conversation." : `Add people to ${group?.name || "this group"}.`}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "create" && (
            <>
              <div className="mb-3 flex items-center gap-3">
                <button type="button" onClick={() => inputRef.current?.click()} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="Choose group photo">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="Selected group" className="h-full w-full object-cover" />
                  ) : <Camera size={22} />}
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" maxLength={100} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none" aria-label="Group name" />
                  <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" maxLength={500} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none" aria-label="Group description" />
                </div>
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
              </div>
              <p className="mb-2 text-xs font-semibold text-slate-700">Members ({selected.length + 1} including you)</p>
            </>
          )}
          {mode === "add" && <p className="mb-2 text-xs font-semibold text-slate-700">Select people to add ({selected.length})</p>}
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none" />
          </div>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {visibleUsers.map((person) => (
              <li key={person.uid}>
                <button type="button" onClick={() => toggle(person.uid)} aria-pressed={selected.includes(person.uid)} className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${selected.includes(person.uid) ? "bg-orange-50" : ""}`}>
                  <ChatParticipantAvatar person={person} size="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{person.displayName || person.email}</span>
                    <span className="block text-xs text-slate-500">{ROLE_LABELS[person.role] || String(person.role || "Staff").replace(/_/g, " ")}</span>
                  </span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected.includes(person.uid) ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300"}`} aria-hidden="true">
                    {selected.includes(person.uid) ? "✓" : ""}
                  </span>
                </button>
              </li>
            ))}
            {visibleUsers.length === 0 && <li className="p-4 text-center text-xs text-slate-400">No available staff found.</li>}
          </ul>
          {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="min-h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
            {busy ? "Saving…" : mode === "create" ? "Create group" : "Add members"}
          </button>
        </footer>
      </div>
    </div>
  );
}
