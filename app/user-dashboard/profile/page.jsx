"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { auth } from "@/lib/firebaseClient";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { Eye, EyeOff, Lock, Monitor, Smartphone, MoreVertical, MapPin, Globe, Clock, RefreshCw, LogOut } from "lucide-react";
import { getStoredSessionId } from "@/app/Component/Hooks/useLoginSession";
import Swal from "sweetalert2";

function SkeletonProfile() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 animate-pulse">
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-8 w-48 bg-slate-200 rounded mt-2" />
        <div className="h-4 w-64 bg-slate-200 rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
            <div className="h-5 w-44 bg-slate-200 rounded mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div className="h-3 w-24 bg-slate-200 rounded mb-1" />
                <div className="h-[46px] bg-slate-200 rounded-xl" />
              </div>
              <div>
                <div className="h-3 w-24 bg-slate-200 rounded mb-1" />
                <div className="h-[46px] bg-slate-200 rounded-xl" />
              </div>
            </div>
            <div className="mt-6">
              <div className="h-3 w-12 bg-slate-200 rounded mb-1" />
              <div className="h-[46px] bg-slate-200 rounded-xl" />
            </div>
            <div className="mt-4">
              <div className="h-3 w-12 bg-slate-200 rounded mb-1" />
              <div className="h-[46px] bg-slate-200 rounded-xl" />
            </div>
            <div className="mt-8 flex justify-end">
              <div className="h-11 w-36 bg-slate-200 rounded-xl" />
            </div>
          </div>
        </div>
        <div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
            <div className="h-4 w-28 bg-slate-200 rounded mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-3 w-16 bg-slate-200 rounded" />
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordCard({ email }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pwSubmitting, setPwSubmitting] = useState(false);

  function validate() {
    const errors = {};
    if (!currentPassword) errors.currentPassword = "Current password is required.";
    if (!newPassword) {
      errors.newPassword = "New password is required.";
    } else if (newPassword.length < 6) {
      errors.newPassword = "New password must be at least 6 characters.";
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your new password.";
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = "Confirm password does not match new password.";
    }
    if (newPassword && currentPassword && newPassword === currentPassword) {
      errors.newPassword = "New password must be different from current password.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setFieldErrors({});
    if (!validate()) return;
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser || !email) {
      Swal.fire("Error", "You must be signed in to change your password.", "error");
      return;
    }
    setPwSubmitting(true);
    try {
      // Verify current password first — update only runs after successful re-auth.
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFieldErrors({});
      Swal.fire("Updated!", "Your password has been changed successfully.", "success");
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") {
        setFieldErrors({ currentPassword: "Current password is incorrect." });
      } else if (code === "auth/weak-password") {
        setFieldErrors({ newPassword: "New password is too weak. Use at least 6 characters." });
      } else if (code === "auth/requires-recent-login") {
        Swal.fire("Error", "Session expired. Please sign in again, then retry.", "error");
      } else {
        Swal.fire("Error", err?.message || "Failed to change password.", "error");
      }
    } finally {
      setPwSubmitting(false);
    }
  }

  const inputCls = (hasError) =>
    `w-full rounded-xl border px-4 py-3 pr-11 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 ${
      hasError ? "border-red-400 bg-red-50/50" : "border-slate-200"
    }`;

  return (
    <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-8" noValidate>
      <div className="flex items-center gap-2 mb-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50">
          <Lock className="h-4 w-4 text-orange-600" />
        </span>
        <h2 className="text-lg font-bold text-slate-900">Change Password</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">Enter your current password to verify, then choose a new one.</p>

      <div className="space-y-5">
        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-slate-700 mb-1">Current Password *</label>
          <div className="relative">
            <input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className={inputCls(fieldErrors.currentPassword)}
            />
            <button type="button" onClick={() => setShowCurrent((v) => !v)} aria-label={showCurrent ? "Hide current password" : "Show current password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.currentPassword && <p className="text-xs text-red-600 mt-1.5">{fieldErrors.currentPassword}</p>}
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">New Password *</label>
          <div className="relative">
            <input
              id="new-password"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className={inputCls(fieldErrors.newPassword)}
            />
            <button type="button" onClick={() => setShowNew((v) => !v)} aria-label={showNew ? "Hide new password" : "Show new password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.newPassword ? (
            <p className="text-xs text-red-600 mt-1.5">{fieldErrors.newPassword}</p>
          ) : (
            <p className="text-xs text-slate-400 mt-1.5">Must be at least 6 characters and different from current password.</p>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password *</label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className={inputCls(fieldErrors.confirmPassword)}
            />
            <button type="button" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.confirmPassword && <p className="text-xs text-red-600 mt-1.5">{fieldErrors.confirmPassword}</p>}
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          disabled={pwSubmitting}
          className="rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-8 py-3 text-sm font-semibold text-white shadow-md hover:from-orange-700 hover:to-rose-700 transition disabled:opacity-50"
        >
          {pwSubmitting ? "Updating..." : "Update Password"}
        </button>
      </div>
    </form>
  );
}

function ActiveDevicesCard({ uid }) {
  const [currentSessionId] = useState(() => getStoredSessionId());
  const [openMenuId, setOpenMenuId] = useState(null);
  const [removingId, setRemovingId] = useState("");
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["user", "login-sessions", uid],
    queryFn: async () => {
      const res = await fetch(`/api/user/login-sessions?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load devices.");
      return data.sessions || [];
    },
    enabled: Boolean(uid),
  });
  const sessions = sessionsQuery.data || [];
  const loadingSessions = sessionsQuery.isLoading;

  async function handleSignOutDevice(session) {
    setOpenMenuId(null);
    const confirm = await Swal.fire({
      title: "Sign out this device?",
      text: `${session.deviceName || "Device"} • ${session.browser || ""} will be removed from your active devices.`,
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
      Swal.fire("Done!", "Device signed out.", "success");
      queryClient.invalidateQueries({ queryKey: ["user", "login-sessions", uid] });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setRemovingId("");
    }
  }

  function handleCopyIp(ip) {
    setOpenMenuId(null);
    const text = ip || "Unknown";
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    Swal.fire({ icon: "success", title: "Copied!", text: `IP ${text} copied.`, timer: 1200, showConfirmButton: false });
  }

  function formatLocation(s) {
    const parts = [s.city, s.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "Unknown";
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-900">Login Device History / Active Devices</h3>
        <button
          type="button"
          onClick={() => sessionsQuery.refetch()}
          disabled={loadingSessions}
          aria-label="Refresh devices"
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingSessions ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">Devices that have logged into your account.</p>

      {loadingSessions ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="h-4 w-28 bg-slate-200 rounded" />
              <div className="h-3 w-40 bg-slate-200 rounded mt-2" />
              <div className="h-3 w-32 bg-slate-200 rounded mt-2" />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No active devices found yet. Your logins will appear here.</p>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto">
          {sessions.map((s) => {
            const isCurrent = currentSessionId && s.sessionId === currentSessionId;
            const Icon = s.deviceType === "mobile" ? Smartphone : Monitor;
            const menuOpen = openMenuId === s.sessionId;
            return (
              <div key={s.sessionId || s._id} className="relative rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200">
                      <Icon className="h-4 w-4 text-slate-600" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{s.deviceName || "Unknown device"}</p>
                        {isCurrent && (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            This device
                          </span>
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <Globe className="h-3 w-3 shrink-0" />
                        {s.browser || "Unknown"}{s.browserVersion ? ` ${s.browserVersion}` : ""} • {s.os || ""}
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
                              onClick={() => handleCopyIp(s.ip)}
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
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last login</span>
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

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.uid) { setIsLoading(false); return; }
    try {
      setError("");
      const res = await fetch(`/api/user/profile?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load profile.");
      setProfile(data.user);
      setDisplayName(data.user.displayName || "");
      setPhoneNumber(data.user.phoneNumber || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleUpdate(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/user/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, displayName, phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to update profile.");
      Swal.fire("Updated!", "Your profile has been updated.", "success");
      loadProfile();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading profile...</div>;

  if (isLoading) return <SkeletonProfile />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Account</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Profile Settings</h1>
        <p className="text-sm text-slate-600 mt-1">Manage your account details.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-sm mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleUpdate} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1234567890"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
              </div>
            </div>
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={profile?.email || user?.email || ''} disabled
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 bg-slate-50 cursor-not-allowed" />
              <p className="text-xs text-slate-400 mt-1">Email cannot be changed.</p>
            </div>
            {profile?.role && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <input type="text" value={profile.role} disabled
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 bg-slate-50 cursor-not-allowed capitalize" />
              </div>
            )}
            {profile?.status && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Status</label>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${profile.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{profile.status}</span>
              </div>
            )}
            <div className="mt-8 flex justify-end">
              <button type="submit" disabled={submitting}
                className="rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-8 py-3 text-sm font-semibold text-white shadow-md hover:from-orange-700 hover:to-rose-700 transition disabled:opacity-50">
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
          <ChangePasswordCard email={profile?.email || user?.email || ""} />
        </div>

        <div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Account Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Joined</span>
                <span className="font-medium text-slate-700">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Login</span>
                <span className="font-medium text-slate-700">{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleDateString() : 'N/A'}</span>
              </div>
              {profile?.availableBalance !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Balance</span>
                  <span className="font-medium text-emerald-700">${Number(profile.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>
          <ActiveDevicesCard uid={user?.uid} />
        </div>
      </div>
    </div>
  );
}
