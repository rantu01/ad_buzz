"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import ArticleEditor from "../ArticleEditor";

export default function EditArticlePage() {
  const params = useParams();
  const id = params?.id;
  const { user } = useAuth();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid || !id) return;
    let mounted = true;
    fetch(`/api/admin/help-center/articles/${id}`, { headers: { "x-user-id": user.uid }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (mounted) {
          if (d.success) setArticle(d.article);
          else setError(d.message || "Not found");
        }
      })
      .catch(() => { if (mounted) setError("Failed to load"); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user?.uid, id]);

  if (loading) return <div className="py-10 text-center text-slate-500">Loading...</div>;
  if (error || !article) return <div className="py-10 text-center text-red-500">{error || "Article not found"}</div>;

  return <ArticleEditor initial={article} />;
}
