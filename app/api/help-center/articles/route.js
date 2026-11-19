import { NextResponse } from "next/server";
import { listArticles, listCategories, getCategoryBySlug } from "@/lib/helpCenterModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category"); // slug or "all"
    const search = searchParams.get("search") || searchParams.get("q");
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "30";

    let categoryId = null;
    if (category && category !== "all") {
      // could be slug or id
      const cats = await listCategories({ activeOnly: true });
      const found = cats.find((c) => c.slug === category || String(c._id) === category);
      if (found) categoryId = found._id;
      else {
        const bySlug = await getCategoryBySlug(category);
        if (bySlug) categoryId = bySlug._id;
      }
    }

    const result = await listArticles({
      status: "published",
      categoryId,
      search: search || null,
      page,
      limit,
      summaryOnly: true,
    });

    const cats = await listCategories({ activeOnly: true });
    const catMap = new Map(cats.map((c) => [String(c._id), c]));
    const items = result.items.map((a) => ({
      ...a,
      categoryName: catMap.get(String(a.categoryId))?.name || "",
      categorySlug: catMap.get(String(a.categoryId))?.slug || "",
    }));

    return NextResponse.json({
      success: true,
      articles: items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
