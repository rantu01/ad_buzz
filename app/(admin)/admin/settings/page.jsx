"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
import { ROLES } from "@/lib/permissions";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useAdmin();
  const [siteName, setSiteName] = useState("Ad Buzz");
  const [primaryColor, setPrimaryColor] = useState("#135B9A");
  const [secondaryColor, setSecondaryColor] = useState("#F48E2B");
  const [dollarRate, setDollarRate] = useState(129);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const isAdmin = profile?.role === ROLES.ADMIN;

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin) {
      router.replace("/admin");
      return;
    }
    fetch("/api/admin/settings", {
      headers: { "x-user-id": user?.uid || "" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.settings) {
          setSiteName(data.settings.siteName || "Ad Buzz");
          setPrimaryColor(data.settings.primaryColor || "#135B9A");
          setSecondaryColor(data.settings.secondaryColor || "#F48E2B");
          setDollarRate(data.settings.dollarRate || 129);
          if (data.settings.logo) setLogoPreview(data.settings.logo);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileLoading, isAdmin, router, user?.uid]);

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let logo = logoPreview;
      if (logoFile) {
        logo = await toBase64(logoFile);
      }

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user-id": user?.uid || "" },
        body: JSON.stringify({ siteName, primaryColor, secondaryColor, logo, dollarRate }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save settings.");

      const root = document.documentElement;
      root.style.setProperty("--primary", primaryColor);
      root.style.setProperty("--secondary", secondaryColor);

      await Swal.fire({ icon: "success", title: "Saved", text: "Site settings updated.", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function removeLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (loading) return <p className="text-slate-500">Loading settings...</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Site Settings</h1>
      <p className="text-sm text-slate-500 mb-6">Customize your brand colors, logo, and site name.</p>

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site Name</label>
            <input type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Primary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-16 rounded-lg border border-slate-200 cursor-pointer" />
                <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Secondary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-16 rounded-lg border border-slate-200 cursor-pointer" />
                <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Dollar Rate (BDT per 1 USD)</label>
            <input type="number" step="0.01" min="0" value={dollarRate} onChange={(e) => setDollarRate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site Logo</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-primary-100 file:text-primary file:font-medium hover:file:bg-primary-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            {logoPreview && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="Logo preview" className="h-14 w-auto rounded-lg border border-slate-200" />
                <button type="button" onClick={removeLogo} className="text-xs text-red-600 underline hover:no-underline">Remove</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-primary-700 transition disabled:opacity-50">
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <div className="flex items-center gap-3 text-sm">
            <span className="inline-block w-5 h-5 rounded" style={{ backgroundColor: primaryColor }} />
            <span className="text-slate-500">Primary</span>
            <span className="inline-block w-5 h-5 rounded" style={{ backgroundColor: secondaryColor }} />
            <span className="text-slate-500">Secondary</span>
          </div>
        </div>
      </form>
    </div>
  );
}
