import { NextResponse } from "next/server";
import { getConversationByCustomer, markRead } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { emitToChannel } from "@/lib/sseManager";

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, conversationId } = body || {};
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    let conv = conversationId ? await (await import("@/lib/chatModel")).getConversationById(conversationId) : await getConversationByCustomer(uid);
    if (!conv || conv.customerId !== uid) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    await markRead(conv.conversationId, uid, "customer");
    emitToChannel("admin:chat", "chat:read", { conversationId: conv.conversationId, readerType: "customer" });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
