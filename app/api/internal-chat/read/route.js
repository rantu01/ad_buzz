import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, markInternalRead } from "@/lib/internalChatModel";
import { emitToUser } from "@/lib/sseManager";

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const conv = await getConversationForParticipant(String(body.conversationId || ""), auth.uid);
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });

  await markInternalRead(conv.conversationId, auth.uid);
  const payload = { conversationId: conv.conversationId, uid: auth.uid, system: "internal" };
  for (const uid of conv.participants) emitToUser(uid, "internal:read", payload);
  return NextResponse.json({ success: true });
}
