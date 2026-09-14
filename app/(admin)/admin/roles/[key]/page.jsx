"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { useAdmin } from "../../components/AdminProvider";
import { hasPermission } from "@/lib/permissions";
import { ArrowLeft, Save, ShieldCheck, MonitorSmartphone } from "lucide-react";

export default function EditRolePage({ params }) {
  const { key } = use(params);
  const router = useRouter();
  const { profile, access } = useAdmin();
  const role = profile?.role || "customer";
  const canManage = hasPermission(role, "manage_roles", access?.permissions) || role === "admin";

  const [roleDoc, setRoleDoc] = useState(null);
  const [catalog, setCatalog] = useState({ permissionGroups: [], level2RouteGroups: [] });
  const [permissions, setPermissions] = useState([]);
  const [level2Routes, setLevel2Routes] = useState([]);
  const [unrestricted, setUnrestricted] = useState(false);
  const [description, setDescription] = useState("");
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/roles");
        const data = await res.json();
        const found = (data.roles || []).find((r) => r.key === key);
        if (!found) {
          await Swal.fire("Not found", "This role does not exist.", "error");
          router.replace("/admin/roles");
          return;
        }
        setRoleDoc(found);
        setCatalog(data.catalog || { permissionGroups: [], level2RouteGroups: [] });
        setPermissions(found.permissions || []);
        setUnrestricted(!Array.isArray(found.level2Routes));
        setLevel2Routes(Array.isArray(found.level2Routes) ? found.level2Routes : []);
        setDescription(found.description || "");
        const first = (data.catalog?.permissionGroups || [])[0];
        setActiveTab(first ? first.key : "level2");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [key, router]);

  const tabs = useMemo(() => {
    const groups = (catalog.permissionGroups || []).map((g) => ({
      key: g.key,
      label: g.label,
      type: "permissions",
      total: g.permissions.length,
      active: g.permissions.filter((p) => permissions.includes(p.key)).length,
    }));
    const allRoutes = (catalog.level2RouteGroups || []).flatMap((g) => g.routes);
    groups.push({
      key: "level2",
      label: "Level 2 Pages",
      type: "routes",
      total: allRoutes.length,
      active: unrestricted ? allRoutes.length : level2Routes.length,
    });
    return groups;
  }, [catalog, permissions, level2Routes, unrestricted]);

  const activeGroup = (catalog.permissionGroups || []).find((g) => g.key === activeTab);

  function togglePermission(permKey) {
    setPermissions((prev) => (prev.includes(permKey) ? prev.filter((p) => p !== permKey) : [...prev, permKey]));
  }

  function toggleGroup(group, on) {
    const keys = group.permissions.map((p) => p.key);
    setPermissions((prev) => (on ? [...new Set([...prev, ...keys])] : prev.filter((p) => !keys.includes(p))));
  }

  function toggleRoute(path) {
    setLevel2Routes((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  }

  function toggleRouteGroup(routes, on) {
    const paths = routes.map((r) => r.path);
    setLevel2Routes((prev) => (on ? [...new Set([...prev, ...paths])] : prev.filter((p) => !paths.includes(p))));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerUid: profile?.uid,
          key,
          description,
          permissions,
          level2Routes: unrestricted ? null : level2Routes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save role.");
      await Swal.fire({ icon: "success", title: "Role Updated", text: "Changes apply to Level 1 and Level 2 immediately.", timer: 2000, showConfirmButton: false });
      router.replace("/admin/roles");
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading role...</p>;
  if (!roleDoc) return null;

  const dirty =
    JSON.stringify([...permissions].sort()) !== JSON.stringify([...(roleDoc.permissions || [])].sort()) ||
    description !== (roleDoc.description || "") ||
    unrestricted !== !Array.isArray(roleDoc.level2Routes) ||
    (!unrestricted && JSON.stringify([...level2Routes].sort()) !== JSON.stringify([...(roleDoc.level2Routes || [])].sort()));

  return (
    <div>
      <Link href="/admin/roles" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to Manage Roles
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Edit Role: {roleDoc.name}
              {roleDoc.isSystem && (
                <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase text-white">System</span>
              )}
            </h1>
            <p className="text-sm text-slate-500">
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">{roleDoc.label}</span>{" "}
              <span className="font-mono text-xs text-slate-400">{roleDoc.key}</span> · {roleDoc.userCount || 0} user(s) assigned
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "#F48E2B" }}
          >
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      {!canManage && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You have view-only access to roles. Only Admins (or roles with Manage Roles permission) can save changes.
        </div>
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canManage}
          placeholder="What is this role for?"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200 disabled:bg-slate-50"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === t.key ? "text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
            style={activeTab === t.key ? { backgroundColor: "#F48E2B" } : {}}
          >
            {t.key === "level2" && <MonitorSmartphone className="h-4 w-4" />}
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${activeTab === t.key ? "bg-white/25 text-white" : t.active === t.total ? "bg-emerald-100 text-emerald-700" : t.active > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
              {t.active}/{t.total}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "level2" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Level 2 Page Access — adsbuzz-ui-next</h2>
              <p className="text-sm text-slate-500">Untick a page to hide it on the Level 2 website/app for this role.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={unrestricted} onChange={(e) => setUnrestricted(e.target.checked)} disabled={!canManage} className="h-4 w-4 accent-orange-500" />
              Unrestricted (legacy — see everything)
            </label>
          </div>
          {unrestricted ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">This role can access every Level 2 page. Uncheck “Unrestricted” to pick pages individually.</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {(catalog.level2RouteGroups || []).map((g) => {
                const paths = g.routes.map((r) => r.path);
                const onCount = paths.filter((p) => level2Routes.includes(p)).length;
                const allOn = onCount === paths.length;
                return (
                  <div key={g.key} className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{g.label}</h3>
                      <button
                        onClick={() => toggleRouteGroup(g.routes, !allOn)}
                        disabled={!canManage}
                        className="text-xs font-semibold text-orange-600 hover:underline disabled:opacity-40"
                      >
                        {allOn ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {g.routes.map((r) => (
                        <label key={r.path} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${level2Routes.includes(r.path) ? "border-orange-200 bg-orange-50/60" : "border-slate-200 bg-white"}`}>
                          <input
                            type="checkbox"
                            checked={level2Routes.includes(r.path)}
                            onChange={() => toggleRoute(r.path)}
                            disabled={!canManage}
                            className="h-4 w-4 accent-orange-500"
                          />
                          <span className="font-medium text-slate-800">{r.label}</span>
                          <span className="ml-auto font-mono text-xs text-slate-400">{r.path}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeGroup ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-semibold text-slate-900">{activeGroup.label} Permissions</h2>
              <p className="text-sm text-slate-500">Controls Level 1 admin panel access for this module.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleGroup(activeGroup, true)} disabled={!canManage} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Select all</button>
              <button onClick={() => toggleGroup(activeGroup, false)} disabled={!canManage} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Clear</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeGroup.permissions.map((p) => {
              const on = permissions.includes(p.key);
              return (
                <label key={p.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${on ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <input type="checkbox" checked={on} onChange={() => togglePermission(p.key)} disabled={!canManage} className="mt-0.5 h-4 w-4 accent-orange-500" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{p.key}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {canManage && (
        <div className="sticky bottom-4 mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "#F48E2B" }}
          >
            <Save className="h-4 w-4" /> {saving ? "Saving..." : dirty ? `Save Changes (${permissions.length} permissions, ${unrestricted ? "unrestricted" : `${level2Routes.length} pages`})` : "No Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
