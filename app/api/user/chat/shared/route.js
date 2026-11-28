import { NextResponse } from "next/server";
import { getChatSharedContentPage, getConversationByCustomer, getConversationById } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const conversationId = searchParams.get("conversationId");
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    const conversation = conversationId
      ? await getConversationById(conversationId)
      : await getConversationByCustomer(uid);
    if (!conversation || conversation.customerId !== uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const page = await getChatSharedContentPage(conversation.conversationId, {
      kind: searchParams.get("kind"),
      before: searchParams.get("before"),
      limit: searchParams.get("limit"),
    });
    return NextResponse.json({ success: true, ...page });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
