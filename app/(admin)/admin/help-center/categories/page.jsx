"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";

function slugify(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export default function AdminHelpCenterCategoriesPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const headers = { "x-user-id": uid || "" };

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", displayOrder: 0, isActive: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/help-center/categories", { headers, cache: "no-store" });
      const data = await res.json();
      if (data.success) setCategories(data.categories || []);
    } catch {}
    finally { setLoading(false); }
  }, [uid]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", slug: "", description: "", displayOrder: 0, isActive: true });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name || "", slug: c.slug || "", description: c.description || "", displayOrder: c.displayOrder || 0, isActive: c.isActive !== false });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Swal.fire("Required", "Name is required.", "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, slug: form.slug ? slugify(form.slug) : slugify(form.name), callerUid: uid };
      let res;
      if (editing) {
        res = await fetch(`/api/admin/help-center/categories/${editing._id}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/admin/help-center/categories", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed");
      setModalOpen(false);
      load();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    const r = await Swal.fire({ title: "Delete category?", text: c.name, icon: "warning", showCancelButton: true, confirmButtonColor: "#dc2626" });
    if (!r.isConfirmed) return;
    try {
      const res = await fetch(`/api/admin/help-center/categories/${c._id}`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ callerUid: uid }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed");
      load();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">Manage help center categories.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706]">
          <Plus size={16} /> Create Category
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c._id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.slug}</td>
                  <td className="px-4 py-3 text-slate-600">{c.description}</td>
                  <td className="px-4 py-3 text-slate-600">{c.displayOrder}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(c)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{editing ? "Edit Category" : "Create Category"}</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Slug</label>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Display Order</label>
                <input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} id="isActive" />
                <label htmlFor="isActive" className="text-sm text-slate-700">Active</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={saving} onClick={handleSave} className="rounded-xl bg-[#F48E2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D97706] disabled:opacity-50">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
