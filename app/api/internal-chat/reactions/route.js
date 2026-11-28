import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, toggleInternalReaction } from "@/lib/internalChatModel";
import { normalizeEmoji } from "@/lib/groupChat";
import { emitToUser } from "@/lib/sseManager";

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const conversationId = String(body?.conversationId || "");
  const conv = await getConversationForParticipant(conversationId, auth.uid);
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
  const emoji = normalizeEmoji(body?.emoji);
  if (!emoji) return NextResponse.json({ success: false, message: "Invalid reaction" }, { status: 400 });
  try {
    const messageId = String(body?.messageId || "");
    const result = await toggleInternalReaction(conversationId, messageId, auth.uid, emoji);
    if (!result) return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    const payload = { conversationId, messageId, reactions: result.reactions, uid: auth.uid, emoji, system: "internal" };
    for (const uid of conv.participants || []) emitToUser(uid, "internal:reaction", payload);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
