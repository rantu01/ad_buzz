import { NextResponse } from "next/server";
import { getArticleBySlug, listCategories, getFeedbackForArticle } from "@/lib/helpCenterModel";

export async function GET(request, { params }) {
  try {
    const { slug } = await params;
    const article = await getArticleBySlug(slug);
    if (!article || article.status !== "published") {
      return NextResponse.json({ success: false, message: "Article not found" }, { status: 404 });
    }
    const cats = await listCategories();
    const cat = cats.find((c) => String(c._id) === String(article.categoryId));
    const feedback = await getFeedbackForArticle(article._id);
    return NextResponse.json({
      success: true,
      article: {
        ...article,
        categoryName: cat?.name || "",
        categorySlug: cat?.slug || "",
        feedback,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
