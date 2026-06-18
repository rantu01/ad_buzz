"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
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
        </div>
      </div>
    </div>
  );
}
