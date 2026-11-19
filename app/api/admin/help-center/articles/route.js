import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import { listArticles, createArticle, listCategories } from "@/lib/helpCenterModel";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

async function requireAdmin(request, body) {
  const callerUid = request.headers.get("x-user-id") || body?.callerUid;
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
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "20";

    let categoryId = null;
    if (category && category !== "all") {
      const cats = await listCategories();
      const found = cats.find((c) => c.slug === category || String(c._id) === category);
      if (found) categoryId = found._id;
    }

    const result = await listArticles({
      status: status && status !== "all" ? status : null,
      categoryId,
      search: search || null,
      page,
      limit,
      summaryOnly: true,
    });

    const cats = await listCategories();
    const catMap = new Map(cats.map((c) => [String(c._id), c]));
    const items = result.items.map((a) => ({
      ...a,
      categoryName: catMap.get(String(a.categoryId))?.name || "",
    }));

    return NextResponse.json({ success: true, articles: items, total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const auth = await requireAdmin(request, body);
    if (auth.error) return auth.error;

    const { title, slug, categoryId, contentType, description, content, featuredImage, status, authorName } = body;
    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, message: "Title required" }, { status: 400 });
    }

    const article = await createArticle({
      title: title.trim(),
      slug,
      categoryId,
      contentType: contentType || "Guide",
      description: description || "",
      content: sanitizeHtml(content || ""),
      featuredImage: featuredImage || null,
      status: status || "draft",
      authorId: auth.user.uid,
      authorName: authorName || auth.user.displayName || auth.user.email,
    });

    return NextResponse.json({ success: true, article });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
