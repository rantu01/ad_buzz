"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useUserAlerts } from "@/app/user-dashboard/components/UserAlertProvider";
import { ArrowLeft, ChevronRight } from "lucide-react";

function formatTodayDhaka() {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
}

export default function HelpCenterArticlePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug;
  const { user } = useAuth();
  const { unread } = useUserAlerts();

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const today = formatTodayDhaka();

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/help-center/articles/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const data = await res.json();
        if (mounted) {
          if (data.success) setArticle(data.article);
          else setError(data.message || "Article not found");
        }
      } catch (e) {
        if (mounted) setError("Failed to load article");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [slug]);

  const submitFeedback = async (helpful) => {
    if (!article?._id || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/help-center/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article._id, userId: user?.uid || null, helpful }),
      });
      setFeedbackSubmitted(true);
    } catch {}
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="rounded-2xl border border-[#E5DED6] bg-white p-10 text-center text-slate-500">Loading...</div>;
  }
  if (error || !article) {
    return (
      <div className="rounded-2xl border border-[#E5DED6] bg-white p-10 text-center text-slate-500">
        {error || "Article not found."}
        <div className="mt-4">
          <Link href="/help-center" className="text-[#F48E2B] underline">Back to Help Center</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Article navigation header */}
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => router.push("/help-center")} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5DED6] bg-white text-slate-700 hover:bg-slate-50" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{article.title}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Main content */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-[#E5DED6] bg-white p-6 shadow-sm">
            {article.description && (
              <>
                <p className="text-base font-semibold text-slate-900">{article.description}</p>
                <hr className="my-4 border-[#E5DED6]" />
              </>
            )}
            <div
              className="prose prose-slate max-w-none text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#F48E2B] [&_blockquote]:border-l-4 [&_blockquote]:border-[#E5DED6] [&_blockquote]:pl-4 [&_blockquote]:italic [&_img]:max-w-full [&_img]:rounded-lg"
              dangerouslySetInnerHTML={{ __html: article.content || "" }}
            />
          </div>

          {/* Feedback */}
          <div className="mt-6 rounded-2xl border border-[#E5DED6] bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Was this helpful?</p>
            {feedbackSubmitted ? (
              <p className="mt-3 text-sm text-green-600">Thanks for your feedback!</p>
            ) : (
              <div className="mt-3 flex gap-3">
                <button type="button" disabled={submitting} onClick={() => submitFeedback(true)} className="rounded-xl border border-[#E5DED6] bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Yes
                </button>
                <button type="button" disabled={submitting} onClick={() => submitFeedback(false)} className="rounded-xl border border-[#E5DED6] bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  No
                </button>
              </div>
            )}
          </div>

          {/* Still need help */}
          <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#E5DED6] bg-white p-6 shadow-sm sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-900">Still need help?</p>
              <p className="text-sm text-slate-500">Open a ticket and our team will get back to you.</p>
            </div>
            <button type="button" onClick={() => router.push("/user-dashboard/support-tickets")} className="rounded-xl bg-[#F48E2B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#D97706]">
              Open a ticket
            </button>
          </div>
        </div>

        {/* About sidebar */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-[#E5DED6] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">About</h3>
            <hr className="my-3 border-[#E5DED6]" />
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Category</span>
                <span className="font-medium text-slate-900">{article.categoryName || "General"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Format</span>
                <span className="font-medium text-slate-900">{article.contentType || "Guide"} · {article.readingTime || 1} min read</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Last updated</span>
                <span className="font-medium text-slate-900">{today}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
