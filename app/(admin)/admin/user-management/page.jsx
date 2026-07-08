"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { useAdmin } from "../components/AdminProvider";
import { ROLES, ROLE_LABELS, hasPermission } from "@/lib/permissions";
import { Plus, X, Edit3, Save, Trash2, User as UserIcon } from "lucide-react";

export default function UserManagementPage() {
  const { profile } = useAdmin();
  const role = profile?.role || "customer";
  const isAdmin = role === "admin";
  const canManageBalance = hasPermission(role, "manage_user_balance");
  const canCreateUsers = hasPermission(role, "create_users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [createForm, setCreateForm] = useState({ email: "", password: "", displayName: "", confirmPassword: "" });
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const updateUser = async (uid, updateFields, silent = false) => {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, callerUid: profile?.uid, ...updateFields }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      if (!silent) await Swal.fire({ icon: "error", title: "Update failed", text: result.message || "Please try again." });
      return false;
    }
    return true;
  };

  async function handleCreateUser(e) {
    e.preventDefault();
    if (!createForm.email.trim() || !createForm.password) {
      Swal.fire("Required", "Email and password are required.", "warning");
      return;
    }
    if (createForm.password.length < 6) {
      Swal.fire("Weak Password", "Password must be at least 6 characters.", "warning");
      return;
    }
    if (createForm.password !== createForm.confirmPassword) {
      Swal.fire("Error", "Passwords do not match.", "warning");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createForm.email.trim(),
          password: createForm.password,
          displayName: createForm.displayName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create user.");
      Swal.fire({ icon: "success", title: "User Created", text: `Account created for ${data.user.email}`, timer: 2000, showConfirmButton: false });
      setShowCreateModal(false);
      setCreateForm({ email: "", password: "", displayName: "", confirmPassword: "" });
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(user) {
    setEditForm({
      uid: user.uid,
      numericId: user.numericId || "",
      displayName: user.displayName || "",
      email: user.email || "",
      role: user.role || "customer",
      availableBalance: user.availableBalance || 0,
      accountStatus: user.accountStatus || "active",
      password: "",
      dollarRate: user.dollarRate || "",
      groupName: user.groupName || "",
    });
    setEditingUser(user);
  }

  async function handleSaveEdit() {
    const uid = editForm.uid;
    setSaving(true);
    try {
      const updates = {};

      if (editForm.displayName !== editingUser.displayName) {
        updates.displayName = editForm.displayName;
      }
      if (editForm.role !== editingUser.role && isAdmin) {
        updates.role = editForm.role;
      }
      if (Number(editForm.availableBalance) !== Number(editingUser.availableBalance || 0)) {
        updates.availableBalance = Number(editForm.availableBalance);
      }
      if (editForm.accountStatus !== (editingUser.accountStatus || "active")) {
        updates.accountStatus = editForm.accountStatus;
      }
      if (editForm.dollarRate !== (editingUser.dollarRate || "")) {
        updates.dollarRate = editForm.dollarRate ? Number(editForm.dollarRate) : null;
      }

      if (editForm.groupName !== (editingUser.groupName || "")) {
        updates.groupName = editForm.groupName;
      }

      if (editForm.password) {
        updates.password = editForm.password;
      }

      const success = await updateUser(uid, updates, false);
      if (success) {
        await Swal.fire({ icon: "success", title: "User updated", timer: 1200, showConfirmButton: false });
        setEditingUser(null);
        loadData();
      }
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser() {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete User?",
      text: `This will permanently delete ${editingUser.displayName || editingUser.email}. This action cannot be undone.`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete permanently",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: editingUser.uid, callerUid: profile?.uid }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete user.");

      await Swal.fire({ icon: "success", title: "User Deleted", timer: 1200, showConfirmButton: false });
      setEditingUser(null);
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const formatMoney = (val) => {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.email?.toLowerCase().includes(q) || u.uid?.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} total users</p>
        </div>
        {canCreateUsers && (
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#F48E2B" }}>
            <Plus className="h-4 w-4" /> Create User
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by email, name, or UID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white flex-1 max-w-md"
          />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : filteredUsers.length ? (
          filteredUsers.map((user) => (
            <div key={user.uid} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <p className="font-semibold text-slate-900">{user.displayName || user.email || user.uid}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.role === "admin" ? "bg-purple-50 text-purple-700" : user.role && user.role !== "customer" ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-600"}`}>
                      {ROLE_LABELS[user.role] || user.role || "Customer"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {user.numericId || "—"} | UID: {user.uid?.slice(0, 24)}...</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number" step="0.01"
                    defaultValue={Number(user.availableBalance || 0)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-28 bg-white"
                    onBlur={(e) => { const v = e.target.value; if (Number(v) !== Number(user.availableBalance || 0)) updateUser(user.uid, { availableBalance: v }); }}
                    disabled={!canManageBalance}
                  />

                  <select
                    defaultValue={user.accountStatus || "active"}
                    onChange={(e) => updateUser(user.uid, { accountStatus: e.target.value })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                    disabled={!canManageBalance}
                  >
                    <option value="active">active</option>
                    <option value="frozen">frozen</option>
                  </select>

                  <button onClick={() => openEditModal(user)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-slate-500">No users found.</p>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Create User Account</h3>
              <button onClick={() => { setShowCreateModal(false); setCreateForm({ email: "", password: "", displayName: "", confirmPassword: "" }); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <InputField label="Full Name" value={createForm.displayName} onChange={(v) => setCreateForm((p) => ({ ...p, displayName: v }))} placeholder="e.g. John Doe" required={false} />
              <InputField label="Email *" value={createForm.email} onChange={(v) => setCreateForm((p) => ({ ...p, email: v }))} placeholder="user@example.com" type="email" />
              <InputField label="Password *" value={createForm.password} onChange={(v) => setCreateForm((p) => ({ ...p, password: v }))} placeholder="At least 6 characters" type="password" />
              <InputField label="Confirm Password *" value={createForm.confirmPassword} onChange={(v) => setCreateForm((p) => ({ ...p, confirmPassword: v }))} placeholder="Confirm password" type="password" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); setCreateForm({ email: "", password: "", displayName: "", confirmPassword: "" }); }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: "#F48E2B" }}>{saving ? "Creating..." : "Create Account"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Edit User: {editingUser.displayName || editingUser.email}
                <span className="ml-2 text-sm font-normal text-slate-400">#{editForm.numericId}</span>
              </h3>
              <button onClick={() => setEditingUser(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Display Name" value={editForm.displayName} onChange={(v) => setEditForm((p) => ({ ...p, displayName: v }))} />
                <InputField label="Group Name" value={editForm.groupName} onChange={(v) => setEditForm((p) => ({ ...p, groupName: v }))} placeholder="e.g. Marketing Team" />
              </div>
              <InputField label="Email" value={editForm.email} onChange={(v) => setEditForm((p) => ({ ...p, email: v }))} disabled />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                    disabled={!isAdmin}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary">
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <InputField label="New Password (leave blank to keep)" value={editForm.password} onChange={(v) => setEditForm((p) => ({ ...p, password: v }))} placeholder="Optional" type="password" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputField label="Available Balance (USD)" value={editForm.availableBalance} onChange={(v) => setEditForm((p) => ({ ...p, availableBalance: v }))} type="number" />
                <InputField label="Dollar Rate (BDT per 1 USD)" value={editForm.dollarRate} onChange={(v) => setEditForm((p) => ({ ...p, dollarRate: v }))} placeholder="Global default: 129" type="number" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Account Status</label>
                <select value={editForm.accountStatus} onChange={(e) => setEditForm((p) => ({ ...p, accountStatus: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary">
                  <option value="active">Active</option>
                  <option value="frozen">Frozen</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={handleDeleteUser} disabled={saving}
                  className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                <div className="flex-1 flex gap-3">
                  <button onClick={() => setEditingUser(null)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={saving}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#F48E2B" }}>
                    <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text", disabled = false, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} required={required !== false} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary disabled:bg-slate-50 disabled:text-slate-400" />
    </div>
  );
}
