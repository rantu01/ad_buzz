"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
import { Plus, Search, Pencil, Trash2, Eye, CheckCircle, XCircle } from "lucide-react";
import Swal from "sweetalert2";
import Pagination from "@/app/Component/Pagination";

const LIMIT = 10;

export default function AdminHelpCenterArticlesPage() {
  const { user } = useAuth();
  const { profile } = useAdmin();
  const uid = user?.uid;

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const headers = { "x-user-id": uid || "" };

  const loadCategories = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch("/api/admin/help-center/categories", { headers, cache: "no-store" });
      const data = await res.json();
      if (data.success) setCategories(data.categories || []);
    } catch {}
  }, [uid]);

  const loadArticles = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/admin/help-center/articles?${params.toString()}`, { headers, cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setArticles(data.articles || []);
        setTotal(data.total || 0);
      }
    } catch {}
    finally { setLoading(false); }
  }, [uid, page, statusFilter, categoryFilter, debouncedSearch]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadCategories(); }, [loadCategories]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadArticles(); }, [loadArticles]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleDelete = async (id) => {
    const r = await Swal.fire({ title: "Delete article?", text: "This cannot be undone.", icon: "warning", showCancelButton: true, confirmButtonColor: "#dc2626" });
    if (!r.isConfirmed) return;
    try {
      const res = await fetch(`/api/admin/help-center/articles/${id}`, { method: "DELETE", headers });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed");
      Swal.fire({ icon: "success", title: "Deleted", timer: 1200, showConfirmButton: false });
      loadArticles();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  const handleStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/admin/help-center/articles/${id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status, callerUid: uid }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed");
      loadArticles();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  const catMap = new Map(categories.map((c) => [String(c._id), c.name]));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Help Center Articles</h1>
          <p className="text-sm text-slate-500">Manage all help center content.</p>
        </div>
        <Link href="/admin/help-center/new" className="inline-flex items-center gap-2 rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706]">
          <Plus size={16} /> Create Article
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search articles..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-secondary/30" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-500">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">No articles found.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articles.map((a) => (
                <tr key={a._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.title}</td>
                  <td className="px-4 py-3 text-slate-600">{catMap.get(String(a.categoryId)) || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.contentType}</td>
                  <td className="px-4 py-3 text-slate-600">{a.authorName || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === "published" ? "bg-green-100 text-green-700" : a.status === "draft" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-slate-500">{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/help-center/${a.slug}`} target="_blank" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="View">
                        <Eye size={16} />
                      </Link>
                      <Link href={`/admin/help-center/${a._id}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                        <Pencil size={16} />
                      </Link>
                      {a.status !== "published" ? (
                        <button onClick={() => handleStatus(a._id, "published")} className="rounded-lg p-1.5 text-green-600 hover:bg-green-50" title="Publish">
                          <CheckCircle size={16} />
                        </button>
                      ) : (
                        <button onClick={() => handleStatus(a._id, "unpublished")} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50" title="Unpublish">
                          <XCircle size={16} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(a._id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
