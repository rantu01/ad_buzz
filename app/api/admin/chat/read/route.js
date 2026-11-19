import { NextResponse } from "next/server";
import { getConversationById, markRead } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";
import { emitToUser, emitToChannel } from "@/lib/sseManager";

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, conversationId } = body || {};
    if (!uid || !conversationId) return NextResponse.json({ success: false, message: "uid and conversationId required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const conv = await getConversationById(conversationId);
    if (!conv) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    await markRead(conversationId, uid, "staff");
    emitToUser(conv.customerId, "chat:read", { conversationId, readerType: "staff" });
    emitToChannel("admin:chat", "chat:read", { conversationId, readerType: "staff" });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
