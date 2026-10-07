"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Swal from "sweetalert2";
import {
  User,
  Monitor,
  Smartphone,
  MoreVertical,
  Globe,
  MapPin,
  Clock,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useLoginSession, getStoredSessionId } from "@/app/Component/Hooks/useLoginSession";
import { ROLE_LABELS } from "@/lib/permissions";

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
      <div className="h-5 w-40 bg-slate-200 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-full bg-slate-200 rounded" />
        ))}
      </div>
    </div>
  );
}

function initialsOf(name, email) {
  const src = (name || "").trim() || (email || "").split("@")[0] || "A";
  const parts = src.replace(/[_.-]+/g, " ").split(" ").filter(Boolean);
  const initials = ((parts[0]?.[0] || "A") + (parts[1]?.[0] || "")).toUpperCase();
  return initials;
}

function formatRole(role) {
  if (!role) return "N/A";
  return ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function EditProfileCard({ uid, initialName, initialPhone }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(initialName || "");
  const [phoneNumber, setPhoneNumber] = useState(initialPhone || "");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setFieldError("");
    const name = displayName.trim();
    if (!name) {
      setFieldError("Display name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, displayName: name, phoneNumber: phoneNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to update profile.");
      queryClient.invalidateQueries({ queryKey: ["admin", "profile", uid] });
      Swal.fire({ icon: "success", title: "Saved", text: "Your profile has been updated.", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" noValidate>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Edit Profile</h2>
      <p className="text-sm text-slate-500 mb-6">Update your display name and phone number.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="admin-display-name" className="block text-sm font-medium text-slate-700 mb-1">Display Name *</label>
          <input
            id="admin-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>
        <div>
          <label htmlFor="admin-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
          <input
            id="admin-phone"
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+8801XXXXXXXXX"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>
      </div>
      {fieldError && <p className="text-xs text-red-600 mt-3">{fieldError}</p>}
      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-8 py-3 text-sm font-semibold text-white shadow-md hover:from-orange-700 hover:to-rose-700 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function LoginActivityCard({ uid }) {
  const queryClient = useQueryClient();
  const [currentSessionId] = useState(() => getStoredSessionId());
  const [openMenuId, setOpenMenuId] = useState(null);
  const [removingId, setRemovingId] = useState("");
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["admin", "login-sessions", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/login-sessions?uid=${encodeURIComponent(uid)}&limit=20`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load login activity.");
      return data.sessions || [];
    },
    enabled: Boolean(uid),
  });
  const sessions = sessionsQuery.data || [];
  const others = sessions.filter((s) => s.sessionId !== currentSessionId);

  async function handleSignOutDevice(session) {
    setOpenMenuId(null);
    const confirm = await Swal.fire({
      title: "Sign out this device?",
      text: `${session.deviceName || "Device"} • ${session.browser || ""} will be signed out.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sign out",
      cancelButtonText: "Cancel",
    });
    if (!confirm.isConfirmed) return;
    setRemovingId(session.sessionId);
    try {
      const res = await fetch(
        `/api/user/login-sessions?uid=${encodeURIComponent(uid)}&sessionId=${encodeURIComponent(session.sessionId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to sign out device.");
      Swal.fire({ icon: "success", title: "Done!", text: "Device signed out.", timer: 1500, showConfirmButton: false });
      queryClient.invalidateQueries({ queryKey: ["admin", "login-sessions", uid] });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setRemovingId("");
    }
  }

  async function handleSignOutOthers() {
    if (others.length === 0) return;
    const confirm = await Swal.fire({
      title: `Sign out ${others.length} other device${others.length > 1 ? "s" : ""}?`,
      text: "Your current device will stay signed in.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sign out others",
      cancelButtonText: "Cancel",
    });
    if (!confirm.isConfirmed) return;
    setSigningOutOthers(true);
    try {
      await Promise.all(
        others.map((s) =>
          fetch(
            `/api/user/login-sessions?uid=${encodeURIComponent(uid)}&sessionId=${encodeURIComponent(s.sessionId)}`,
            { method: "DELETE" }
          )
        )
      );
      Swal.fire({ icon: "success", title: "Done!", text: "All other devices signed out.", timer: 1500, showConfirmButton: false });
      queryClient.invalidateQueries({ queryKey: ["admin", "login-sessions", uid] });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSigningOutOthers(false);
    }
  }

  function formatLocation(s) {
    const parts = [s.city, s.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "Unknown";
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-bold text-slate-900">Login Activity / Devices</h2>
        <div className="flex items-center gap-2">
          {others.length > 0 && (
            <button
              type="button"
              onClick={handleSignOutOthers}
              disabled={signingOutOthers}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {signingOutOthers ? "Signing out..." : "Sign out other devices"}
            </button>
          )}
          <button
            type="button"
            onClick={() => sessionsQuery.refetch()}
            disabled={sessionsQuery.isLoading}
            aria-label="Refresh login activity"
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sessionsQuery.isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">Devices and browsers where this admin account has logged in.</p>

      {sessionsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="h-4 w-28 bg-slate-200 rounded" />
              <div className="h-3 w-40 bg-slate-200 rounded mt-2" />
              <div className="h-3 w-32 bg-slate-200 rounded mt-2" />
            </div>
          ))}
        </div>
      ) : sessionsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load login activity.{" "}
          <button type="button" onClick={() => sessionsQuery.refetch()} className="font-semibold underline">Retry</button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No login activity recorded yet. Sessions appear here after sign-in.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => {
            const isCurrent = currentSessionId && s.sessionId === currentSessionId;
            const Icon = s.deviceType === "mobile" ? Smartphone : Monitor;
            const menuOpen = openMenuId === s.sessionId;
            return (
              <div key={s.sessionId || s._id} className="relative rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200">
                      <Icon className="h-4 w-4 text-slate-600" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{s.deviceName || "Unknown device"}</p>
                        {isCurrent ? (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            This device • Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Previous session
                          </span>
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <Globe className="h-3 w-3 shrink-0" />
                        {s.browser || "Unknown"}{s.browserVersion ? ` ${s.browserVersion}` : ""} • {s.os || "Unknown OS"}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(menuOpen ? null : s.sessionId)}
                        aria-label={`Manage ${s.deviceName || "device"}`}
                        aria-haspopup="menu"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuOpen && (
                        <>
                          <button type="button" aria-label="Close menu" onClick={() => setOpenMenuId(null)} className="fixed inset-0 z-10 cursor-default" />
                          <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuId(null);
                                const text = s.ip || "Unknown";
                                if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
                                Swal.fire({ icon: "success", title: "Copied!", text: `IP ${text} copied.`, timer: 1200, showConfirmButton: false });
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Globe className="h-3.5 w-3.5" /> Copy IP address
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={removingId === s.sessionId}
                              onClick={() => handleSignOutDevice(s)}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              {removingId === s.sessionId ? "Signing out..." : "Sign out this device"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-1.5 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
                  <p className="flex items-center justify-between gap-2">
                    <span>IP address</span>
                    <span className="font-mono font-medium text-slate-700">{s.ip || "Unknown"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Location</span>
                    <span className="font-medium text-slate-700 text-right">{formatLocation(s)}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> First login</span>
                    <span className="font-medium text-slate-700 text-right">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString() : "Unknown"}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last active</span>
                    <span className="font-medium text-slate-700 text-right">
                      {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString() : "Unknown"}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid;

  // Register this browser as a login session (same existing session system
  // used by the user dashboard; best-effort, never blocks the page).
  useLoginSession(uid, user?.email);

  const profileQuery = useQuery({
    queryKey: ["admin", "profile", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/profile?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load profile.");
      return data.user;
    },
    enabled: Boolean(uid),
  });
  const profile = profileQuery.data;
  const photoURL = user?.photoURL || "";

  if (authLoading || (profileQuery.isLoading && !profile)) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-1">Profile</h1>
        <p className="text-sm text-slate-500 mb-6">Your account details and login activity.</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <div className="lg:col-span-2"><SkeletonCard /></div>
        </div>
        <div className="mt-6"><SkeletonCard /></div>
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-1">Profile</h1>
        <p className="text-sm text-slate-500 mb-6">Your account details and login activity.</p>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load profile.{" "}
          <button type="button" onClick={() => profileQuery.refetch()} className="font-semibold underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Profile</h1>
      <p className="text-sm text-slate-500 mb-6">Your account details and login activity.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoURL} alt="Profile" className="h-16 w-16 rounded-2xl object-cover border border-slate-200" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#135B9A] to-[#F48E2B] text-xl font-bold text-white">
                {initialsOf(profile.displayName, profile.email)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-900 truncate">{profile.displayName || "Unnamed Admin"}</p>
              <p className="text-sm text-slate-500 truncate">{profile.email || user?.email || ""}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white capitalize">
                <User className="h-3 w-3" /> {formatRole(profile.role)}
              </span>
            </div>
          </div>

          <h2 className="text-sm font-bold text-slate-900 mt-6 mb-4">Admin Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Name</span>
              <span className="font-medium text-slate-700 text-right">{profile.displayName || "N/A"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-700 text-right break-all">{profile.email || "N/A"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Phone</span>
              <span className="font-medium text-slate-700 text-right">{profile.phoneNumber || "N/A"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Role</span>
              <span className="font-medium text-slate-700 capitalize">{formatRole(profile.role)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Status</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${(profile.accountStatus || "active") === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {profile.accountStatus || "active"}
              </span>
            </div>
            {profile.customId && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">User ID</span>
                <span className="font-mono font-medium text-slate-700">{profile.customId}</span>
              </div>
            )}
            {profile.accountType && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Account Type</span>
                <span className="font-medium text-slate-700 capitalize">{profile.accountType}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Joined</span>
              <span className="font-medium text-slate-700">{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Last Login</span>
              <span className="font-medium text-slate-700">{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "N/A"}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <EditProfileCard
            key={profile._id || uid}
            uid={uid}
            initialName={profile.displayName || ""}
            initialPhone={profile.phoneNumber || ""}
          />
        </div>
      </div>

      <div className="mt-6">
        <LoginActivityCard uid={uid} />
      </div>
    </div>
  );
}
