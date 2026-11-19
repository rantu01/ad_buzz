import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/chatModel";
import { emitToUser, emitToChannel } from "@/lib/sseManager";

export async function POST(request) {
  try {
    const body = await request.json();
    const { fromUid, toUid, conversationId, callId, type, payload } = body || {};
    if (!fromUid || !type) return NextResponse.json({ success: false, message: "fromUid and type required" }, { status: 400 });
    const fromUser = await getUserByUid(fromUid);
    if (!fromUser) return NextResponse.json({ success: false, message: "Sender not found" }, { status: 404 });
    const eventPayload = { fromUid, toUid, conversationId, callId, type, payload, fromName: fromUser.displayName || fromUser.email, fromAvatar: fromUser.avatar || "", fromRole: fromUser.role };
    if (toUid) {
      emitToUser(toUid, "chat:signal", eventPayload);
    } else {
      emitToChannel("admin:chat", "chat:signal", eventPayload);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
