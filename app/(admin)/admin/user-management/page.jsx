"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const updateUser = async (uid, updateFields) => {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, ...updateFields }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      await Swal.fire({ icon: "error", title: "Update failed", text: result.message || "Please try again." });
      return;
    }
    await Swal.fire({ icon: "success", title: "User updated", timer: 1200, showConfirmButton: false });
    loadData();
  };

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
                    <p className="font-semibold text-slate-900">{user.displayName || user.email || user.uid}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.role === "admin" ? "bg-purple-50 text-purple-700" : "bg-slate-50 text-slate-600"}`}>
                      {user.role || "user"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">UID: {user.uid?.slice(0, 24)}...</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    defaultValue={user.role || "user"}
                    onChange={(e) => updateUser(user.uid, { role: e.target.value })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>

                  <input
                    type="number" step="0.01"
                    defaultValue={Number(user.availableBalance || 0)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-28 bg-white"
                    onBlur={(e) => updateUser(user.uid, { availableBalance: e.target.value })}
                  />

                  <select
                    defaultValue={user.accountStatus || "active"}
                    onChange={(e) => updateUser(user.uid, { accountStatus: e.target.value })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="active">active</option>
                    <option value="frozen">frozen</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-slate-500">No users found.</p>
        )}
      </div>
    </div>
  );
}
