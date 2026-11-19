import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import { getFeedbackStats, listArticles } from "@/lib/helpCenterModel";

async function requireAdmin(request) {
  const callerUid = request.headers.get("x-user-id");
  if (!callerUid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  const user = await getUserByUid(callerUid);
  if (user?.role !== ROLES.ADMIN) return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId");
    const stats = await getFeedbackStats({ articleId: articleId || null });
    const articles = await listArticles({ status: null, page: 1, limit: 1000, summaryOnly: true });
    const map = new Map(articles.items.map((a) => [String(a._id), a]));
    const rows = stats.map((s) => {
      const a = map.get(String(s._id));
      const total = s.total || 0;
      const pct = total > 0 ? Math.round((s.yes / total) * 100) : 0;
      return {
        articleId: String(s._id),
        title: a?.title || "Unknown",
        yes: s.yes,
        no: s.no,
        total,
        percentage: pct,
      };
    });
    // include articles with zero feedback? optional; include all articles
    const withFeedbackIds = new Set(rows.map((r) => r.articleId));
    for (const a of articles.items) {
      if (!withFeedbackIds.has(String(a._id))) {
        rows.push({ articleId: String(a._id), title: a.title, yes: 0, no: 0, total: 0, percentage: 0 });
      }
    }
    return NextResponse.json({ success: true, stats: rows });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
