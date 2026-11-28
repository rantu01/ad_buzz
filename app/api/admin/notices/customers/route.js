import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { PERMISSIONS } from "@/lib/permissions";
import { searchNoticeRecipients } from "@/lib/noticeModel";

// Customer picker for the notice audience selector. Identity comes from the
// verified admin token; the search term is escaped server-side in the model.
export async function GET(request) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.VIEW_NOTICES);
    if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const result = await searchNoticeRecipients({
      q: searchParams.get("q"),
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to search customers" },
      { status: 500 }
    );
  }
}
