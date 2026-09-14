"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { useAdmin } from "../components/AdminProvider";
import { hasPermission } from "@/lib/permissions";
import { Plus, X, Edit3, Trash2, ShieldCheck, Search, LayoutGrid, Table2 } from "lucide-react";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 10;

export default function RolesPage() {
  const { profile, access } = useAdmin();
  const role = profile?.role || "customer";
  const livePerms = access?.permissions;
  const canManage = hasPermission(role, "manage_roles", livePerms) || role === "admin";
  const canView = canManage || hasPermission(role, "view_roles", livePerms);

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState("table"); // table | cards
  const [systemFilter, setSystemFilter] = useState("all"); // all | system | custom
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ key: "", name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      setRoles(data.roles || []);
    } catch {
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, systemFilter, view]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roles.filter((r) => {
      if (systemFilter === "system" && !r.isSystem) return false;
      if (systemFilter === "custom" && r.isSystem) return false;
      if (!q) return true;
      return (
        r.name?.toLowerCase().includes(q) ||
        r.label?.toLowerCase().includes(q) ||
        r.key?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    });
  }, [roles, search, systemFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.key.trim() || !createForm.name.trim()) {
      Swal.fire("Required", "Role key and name are required.", "warning");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerUid: profile?.uid,
          key: createForm.key.trim(),
          name: createForm.name.trim(),
          label: createForm.name.trim(),
          description: createForm.description.trim(),
          permissions: [],
          level2Routes: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create role.");
      await Swal.fire({ icon: "success", title: "Role Created", timer: 1500, showConfirmButton: false });
      setShowCreate(false);
      setCreateForm({ key: "", name: "", description: "" });
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(target) {
    if (target.isSystem) {
      Swal.fire("Protected", "System roles cannot be deleted. You can edit their permissions instead.", "info");
      return;
    }
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete role "${target.name}"?`,
      text: target.userCount > 0
        ? `${target.userCount} user(s) still have this role. Reassign them first.`
        : "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch("/api/admin/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerUid: profile?.uid, key: target.key }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete role.");
      await Swal.fire({ icon: "success", title: "Role Deleted", timer: 1200, showConfirmButton: false });
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Roles & Permissions</h1>
        <p className="mt-1 text-sm text-slate-500">You do not have permission to view roles.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Manage Roles</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {roles.length} roles · permissions apply to Level 1 and Level 2 instantly
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#F48E2B" }}
          >
            <Plus className="h-4 w-4" /> New Role
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search roles by name, label or key..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
            />
          </div>
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All roles</option>
            <option value="system">System only</option>
            <option value="custom">Custom only</option>
          </select>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 p-1">
            <button
              onClick={() => setView("table")}
              title="Table view"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === "table" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
            <button
              onClick={() => setView("cards")}
              title="Card view"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === "cards" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading roles...</p>
      ) : !filtered.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">No roles found.</p>
        </div>
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Role Name</th>
                <th className="px-4 py-3 font-semibold">Label</th>
                <th className="px-4 py-3 font-semibold">Permissions</th>
                <th className="px-4 py-3 font-semibold">Users</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        <p className="font-mono text-xs text-slate-400">{r.key}</p>
                      </div>
                      {r.isSystem && (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">System</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">{r.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {r.permissionCount} permissions
                    </span>
                    <p className="mt-1 text-xs text-slate-400">{Array.isArray(r.level2Routes) ? `${r.level2Routes.length} Level 2 pages` : "Level 2 unrestricted"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[260px] flex-wrap gap-1.5">
                      {(r.users || []).map((u, i) => (
                        <span key={i} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700" title={u.email}>
                          {u.displayName || u.email || u.customId || "User"}
                        </span>
                      ))}
                      {r.userCount > (r.users || []).length && (
                        <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">+{r.userCount - r.users.length} more</span>
                      )}
                      {r.userCount === 0 && <span className="text-xs text-slate-400">No users</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/roles/${r.key}`}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={!canManage || r.isSystem}
                        title={r.isSystem ? "System roles cannot be deleted" : "Delete role"}
                        className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paginated.map((r) => (
            <div key={r.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.label} · <span className="font-mono">{r.key}</span></p>
                  </div>
                </div>
                {r.isSystem && (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">System</span>
                )}
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">{r.permissionCount} permissions</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{r.userCount} users</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(r.users || []).map((u, i) => (
                  <span key={i} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700" title={u.email}>
                    {u.displayName || u.email || "User"}
                  </span>
                ))}
                {r.userCount === 0 && <span className="text-xs text-slate-400">No users assigned</span>}
              </div>
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <Link
                  href={`/admin/roles/${r.key}`}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Link>
                <button
                  onClick={() => handleDelete(r)}
                  disabled={!canManage || r.isSystem}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Create Custom Role</h3>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Role Key *</label>
                <input
                  value={createForm.key}
                  onChange={(e) => setCreateForm((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                  placeholder="e.g. regional_manager"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Role Name *</label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Regional Manager"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="What is this role for?"
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
                />
              </div>
              <p className="text-xs text-slate-400">After creating, use Edit to assign granular permissions and Level 2 pages.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "#F48E2B" }}>
                  {saving ? "Creating..." : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
