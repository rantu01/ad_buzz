"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useUserAlerts } from "@/app/user-dashboard/components/UserAlertProvider";
import { useHelpCenterSidebar } from "./layout";
import NotificationBell from "@/app/Component/Notifications/NotificationBell";
import { Search, Menu, ChevronRight } from "lucide-react";

const DEBOUNCE_MS = 350;

export default function HelpCenterPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { unread, items, markRead, markAllRead, soundOn, toggleSound, refresh } = useUserAlerts();
  const { openSidebar } = useHelpCenterSidebar();

  const [categories, setCategories] = useState([]);
  const [allCount, setAllCount] = useState(0);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/help-center/categories", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
        setAllCount(data.allCount || 0);
      }
    } catch {}
  }, []);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory && activeCategory !== "all") params.set("category", activeCategory);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      params.set("limit", "60");
      const res = await fetch(`/api/help-center/articles?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setArticles(data.articles || []);
    } catch {}
    finally { setLoading(false); }
  }, [activeCategory, debouncedSearch]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadCategories(); }, [loadCategories]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadArticles(); }, [loadArticles]);

  const totalCount = allCount;

  return (
    <div>
      {/* Top header */}
      <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#E5DED6] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={openSidebar} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5DED6] bg-white text-slate-700 lg:hidden" aria-label="Open menu">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Support</span>
            <ChevronRight size={14} />
            <span className="font-semibold text-slate-900">Help Center</span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search everything..."
              className="w-full rounded-xl border border-[#E5DED6] bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="rounded-xl border border-[#E5DED6] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Guides
          </button>
          <button type="button" onClick={() => router.push("/user-dashboard/support-tickets")} className="rounded-xl bg-[#F48E2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D97706]">
            Open a ticket
          </button>
          <NotificationBell
            unread={unread}
            items={items}
            title="Notifications"
            subtitle="Updates"
            emptyText="No new notifications."
            viewAllLabel="View all"
            onOpen={refresh}
            onSelect={(n) => { if (n?._id) markRead(String(n._id)); }}
            onMarkAllRead={markAllRead}
            soundOn={soundOn}
            onToggleSound={toggleSound}
            accentClass="bg-amber-100 text-amber-700"
          />
        </div>
      </header>

      {/* Category navigation */}
      <div className="mb-4 overflow-x-auto">
        <div className="flex items-center gap-2 whitespace-nowrap pb-2">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeCategory === "all" ? "bg-[#F48E2B] text-white" : "bg-white border border-[#E5DED6] text-slate-600 hover:bg-slate-50"}`}
          >
            All {totalCount}
          </button>
          {categories.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => setActiveCategory(c.slug)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeCategory === c.slug ? "bg-[#F48E2B] text-white" : "bg-white border border-[#E5DED6] text-slate-600 hover:bg-slate-50"}`}
            >
              {c.name} {c.articleCount ?? 0}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary search */}
      <div className="mb-6 max-w-xs">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help"
            className="w-full rounded-xl border border-[#E5DED6] bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
          />
        </div>
      </div>

      {/* Article grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-[#E5DED6] bg-white" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-2xl border border-[#E5DED6] bg-white p-10 text-center text-slate-500">No articles found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a._id}
              href={`/help-center/${a.slug}`}
              className="group flex flex-col justify-between rounded-2xl border border-[#E5DED6] bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#F48E2B]">{a.categoryName || "General"}</p>
                <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-[#F48E2B]">{a.title}</h3>
                <p className="mt-2 text-sm text-slate-500 line-clamp-3">{a.description}</p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>{a.contentType || "Guide"} · {a.readingTime || 1} min read</span>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-[#F48E2B]" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
