import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, getInternalCall, personOf } from "@/lib/internalChatModel";
import { emitToUser } from "@/lib/sseManager";

const SIGNAL_TYPES = new Set(["offer", "answer", "ice", "end", "cancel", "reject", "missed", "accepted"]);

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const type = String(body.type || "");
  const conversationId = String(body.conversationId || "");
  const callId = body.callId ? String(body.callId) : null;
  if (!SIGNAL_TYPES.has(type)) return NextResponse.json({ success: false, message: "Invalid signal type" }, { status: 400 });

  const conv = await getConversationForParticipant(conversationId, auth.uid);
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
  const toUid = String(body.toUid || conv.participants.find((uid) => uid !== auth.uid) || "");
  // Only the other member of THIS conversation may receive a signal.
  if (!toUid || toUid === auth.uid || !conv.participants.includes(toUid)) {
    return NextResponse.json({ success: false, message: "Invalid signal recipient" }, { status: 403 });
  }
  // A signal may never be injected into somebody else's call.
  if (callId) {
    const call = await getInternalCall(callId);
    if (!call || call.conversationId !== conversationId || ![call.initiatorId, call.receiverId].includes(auth.uid)) {
      return NextResponse.json({ success: false, message: "Invalid call" }, { status: 403 });
    }
  }

  const from = personOf(conv, auth.uid);
  const call = callId ? await getInternalCall(callId) : null;
  emitToUser(toUid, "internal:signal", {
    system: "internal",
    fromUid: auth.uid,
    toUid,
    conversationId,
    callId,
    callType: call?.callType || null,
    fromName: from?.displayName || from?.email || "Colleague",
    fromAvatar: from?.avatar || "",
    fromRole: from?.role || null,
    type,
    payload: body.payload || {},
  });
  return NextResponse.json({ success: true });
}
