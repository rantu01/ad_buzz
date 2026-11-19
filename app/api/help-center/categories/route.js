import { NextResponse } from "next/server";
import { listCategories } from "@/lib/helpCenterModel";
import { countPublishedByCategory } from "@/lib/helpCenterModel";

export async function GET() {
  try {
    const cats = await listCategories({ activeOnly: true });
    const withCounts = await Promise.all(
      cats.map(async (c) => ({
        ...c,
        articleCount: await countPublishedByCategory(c._id),
      }))
    );
    // All count
    const allCount = await countPublishedByCategory(null);
    return NextResponse.json({ success: true, categories: withCounts, allCount });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
