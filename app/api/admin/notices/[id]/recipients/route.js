import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { PERMISSIONS } from "@/lib/permissions";
import { getNoticeById, getRecipientStats, listRecipients } from "@/lib/noticeModel";

export async function GET(request, context) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.VIEW_NOTICES);
    if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

    const params = context?.params ? await context.params : null;
    const id = params?.id || request.nextUrl.pathname.split("/")[4];
    const notice = await getNoticeById(id);
    if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const [stats, recipients] = await Promise.all([
      getRecipientStats(notice),
      listRecipients(notice, { page: searchParams.get("page"), limit: searchParams.get("limit") }),
    ]);
    return NextResponse.json({
      success: true,
      notice: { _id: String(notice._id), title: notice.title, audienceType: notice.audienceType, status: notice.status },
      stats,
      ...recipients,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to load recipients" },
      { status: 500 }
    );
  }
}
