import { NextResponse } from "next/server";
import { resolveChatCaller } from "@/lib/chatCallAuth";
import { getConversationById, toggleChatReaction } from "@/lib/chatModel";
import { normalizeEmoji } from "@/lib/groupChat";
import { isStaffRole } from "@/lib/permissions";
import { emitToUser } from "@/lib/sseManager";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const caller = await resolveChatCaller(request, body?.uid);
  if (!caller.ok) return NextResponse.json({ success: false, message: caller.message }, { status: caller.status });
  const conv = await getConversationById(String(body?.conversationId || ""));
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
  const allowed = conv.customerId === caller.uid || isStaffRole(caller.user.role);
  if (!allowed) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const emoji = normalizeEmoji(body?.emoji);
  if (!emoji) return NextResponse.json({ success: false, message: "Invalid reaction" }, { status: 400 });
  try {
    const messageId = String(body?.messageId || "");
    const result = await toggleChatReaction(conv.conversationId, messageId, caller.uid, emoji);
    if (!result) return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    const payload = { conversationId: conv.conversationId, messageId, reactions: result.reactions, uid: caller.uid, emoji, system: "customer" };
    // Only the conversation's two real participants are notified.
    for (const uid of [conv.customerId, conv.assignedStaffId].filter(Boolean)) {
      emitToUser(uid, "chat:reaction", payload);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
