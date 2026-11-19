"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useAdmin } from "../components/AdminProvider";
import { ArrowLeft, Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link as LinkIcon, Quote, Eye, Save } from "lucide-react";
import Swal from "sweetalert2";

const CONTENT_TYPES = ["Guide", "Blog", "FAQ", "Tutorial"];

function slugify(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export default function ArticleEditor({ initial = null }) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useAdmin();
  const uid = user?.uid;

  const [title, setTitle] = useState(initial?.title || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const effectiveSlug = slugTouched ? slug : slugify(title);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ? String(initial.categoryId) : "");
  const [contentType, setContentType] = useState(initial?.contentType || "Guide");
  const [description, setDescription] = useState(initial?.description || "");
  const [content, setContent] = useState(initial?.content || "");
  const [featuredImage, setFeaturedImage] = useState(initial?.featuredImage || "");
  const [status, setStatus] = useState(initial?.status || "draft");
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const editorRef = useRef(null);

  const headers = { "x-user-id": uid || "" };

  useEffect(() => {
    if (!uid) return;
    fetch("/api/admin/help-center/categories", { headers, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setCategories(d.categories || []); })
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (editorRef.current && content && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content, preview]);

  const exec = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  };

  const insertLink = () => {
    const url = window.prompt("Enter URL");
    if (url) exec("createLink", url);
  };

  const handleSave = async (publishNow) => {
    if (!title.trim()) {
      Swal.fire("Required", "Title is required.", "warning");
      return;
    }
    setSaving(true);
    const finalStatus = publishNow ? "published" : status;
    try {
      const payload = {
        title: title.trim(),
        slug: effectiveSlug || slugify(title),
        categoryId: categoryId || null,
        contentType,
        description: description.trim(),
        content: editorRef.current ? editorRef.current.innerHTML : content,
        featuredImage: featuredImage || null,
        status: finalStatus,
        callerUid: uid,
      };
      const isEdit = !!initial?._id;
      const url = isEdit ? `/api/admin/help-center/articles/${initial._id}` : "/api/admin/help-center/articles";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save");
      Swal.fire({ icon: "success", title: "Saved", timer: 1200, showConfirmButton: false });
      router.push("/admin/help-center");
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => router.push("/admin/help-center")} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">{initial?._id ? "Edit Article" : "Create Article"}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary/30" />

            <label className="block text-sm font-medium text-slate-700 mt-4 mb-1.5">URL Slug</label>
            <input value={effectiveSlug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary/30" />

            <label className="block text-sm font-medium text-slate-700 mt-4 mb-1.5">Short Description / Summary</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary/30" />

            <label className="block text-sm font-medium text-slate-700 mt-4 mb-1.5">Main Content</label>
            {/* Toolbar */}
            <div className="mb-2 flex flex-wrap gap-1 rounded-t-xl border border-slate-200 bg-slate-50 p-2">
              <button type="button" onClick={() => exec("bold")} className="rounded p-1.5 hover:bg-slate-200" title="Bold"><Bold size={16} /></button>
              <button type="button" onClick={() => exec("italic")} className="rounded p-1.5 hover:bg-slate-200" title="Italic"><Italic size={16} /></button>
              <button type="button" onClick={() => exec("formatBlock", "h1")} className="rounded p-1.5 hover:bg-slate-200" title="H1"><Heading1 size={16} /></button>
              <button type="button" onClick={() => exec("formatBlock", "h2")} className="rounded p-1.5 hover:bg-slate-200" title="H2"><Heading2 size={16} /></button>
              <button type="button" onClick={() => exec("formatBlock", "h3")} className="rounded p-1.5 hover:bg-slate-200" title="H3"><Heading3 size={16} /></button>
              <button type="button" onClick={() => exec("insertUnorderedList")} className="rounded p-1.5 hover:bg-slate-200" title="Bullet list"><List size={16} /></button>
              <button type="button" onClick={() => exec("insertOrderedList")} className="rounded p-1.5 hover:bg-slate-200" title="Numbered list"><ListOrdered size={16} /></button>
              <button type="button" onClick={() => exec("formatBlock", "blockquote")} className="rounded p-1.5 hover:bg-slate-200" title="Quote"><Quote size={16} /></button>
              <button type="button" onClick={insertLink} className="rounded p-1.5 hover:bg-slate-200" title="Link"><LinkIcon size={16} /></button>
              <button type="button" onClick={() => setPreview(!preview)} className="ml-auto rounded p-1.5 hover:bg-slate-200" title="Preview"><Eye size={16} /></button>
            </div>
            {preview ? (
              <div className="min-h-[240px] rounded-b-xl border border-slate-200 bg-white p-4 prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
            ) : (
              <div
                ref={editorRef}
                contentEditable
                onInput={() => { if (editorRef.current) setContent(editorRef.current.innerHTML); }}
                className="min-h-[240px] rounded-b-xl border border-slate-200 bg-white p-4 text-sm outline-none focus:ring-2 focus:ring-secondary/30"
                style={{ whiteSpace: "pre-wrap" }}
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm">
                <option value="">-- Select --</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Content Type</label>
              <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm">
                {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Featured Image URL (optional)</label>
              <input value={featuredImage} onChange={(e) => setFeaturedImage(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="unpublished">Unpublished</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button type="button" disabled={saving} onClick={() => handleSave(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Save size={16} /> Save as Draft
              </button>
              <button type="button" disabled={saving} onClick={() => handleSave(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F48E2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706] disabled:opacity-50">
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
