"use client";

import React, { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Search, Users, X } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import useSSE from "@/app/Component/Hooks/useSSE";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";

export default function NewChatModal({ open, onClose, onSelect }) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !user?.uid) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/internal-chat/users?search=${encodeURIComponent(search)}`, {}, user);
        const data = await res.json();
        if (!active) return;
        if (!data.success) throw new Error(data.message || "Could not load the directory");
        setUsers(data.users || []);
        setError("");
      } catch (err) {
        if (active) setError(err.message || "Could not load the directory");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [open, search, user]);

  // Keep the directory indicators live without reopening the modal.
  useSSE({
    uid: user?.uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "internal:presence" && data?.uid) {
        setUsers((prev) => prev.map((u) => u.uid === data.uid ? { ...u, online: Boolean(data.online) } : u));
      }
    },
  });

  if (!open) return null;

  const pick = async (person) => {
    try {
      await onSelect(person);
      onClose();
    } catch (err) {
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: err.message || "Could not start chat", timer: 3500, showConfirmButton: false });
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Start a new chat" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[min(620px,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">New conversation</h2>
            <p className="text-xs text-slate-500">Admins and staff members only</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or role"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => <div key={i} className="animate-pulse rounded-xl bg-slate-100 p-3"><div className="h-4 w-1/2 rounded bg-slate-200" /></div>)}
            </div>
          )}
          {!loading && error && <p className="p-6 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && users.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-slate-400">
              <Users size={28} />
              <p className="text-sm">No admins or staff found{search ? ` for “${search}”` : ""}.</p>
            </div>
          )}
          {!loading && !error && users.map((person) => (
            <button
              key={person.uid}
              type="button"
              onClick={() => pick(person)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
            >
              <ChatParticipantAvatar person={person} size="h-10 w-10" online={person.online} showOfflineIndicator />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{person.displayName}</span>
                <span className="block truncate text-xs text-slate-500">{person.designation || person.email}</span>
              </span>
              <span className={`text-[11px] font-medium ${person.online ? "text-green-600" : "text-slate-400"}`}>{person.online ? "Online" : "Offline"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
