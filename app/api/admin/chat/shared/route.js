import { NextResponse } from "next/server";
import { getChatSharedContentPage, getConversationById, getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const conversationId = searchParams.get("conversationId");
    if (!uid || !conversationId) {
      return NextResponse.json({ success: false, message: "uid and conversationId required" }, { status: 400 });
    }
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const conversation = await getConversationById(conversationId);
    if (!conversation) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    const page = await getChatSharedContentPage(conversationId, {
      kind: searchParams.get("kind"),
      before: searchParams.get("before"),
      limit: searchParams.get("limit"),
    });
    return NextResponse.json({ success: true, ...page });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
