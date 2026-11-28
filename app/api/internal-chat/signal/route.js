import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, getInternalCall } from "@/lib/internalChatModel";
import { emitToUser, getCallClaim } from "@/lib/sseManager";

const SIGNAL_TYPES = new Set(["offer", "answer", "ice", "end", "cancel", "reject", "missed", "accepted", "media", "renegotiate", "renegotiate-answer"]);

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
  const toUid = String(body.toUid || (conv.type === "group" ? "" : conv.participants.find((uid) => uid !== auth.uid)) || "");
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

  const call = callId ? await getInternalCall(callId) : null;
  if (type === "offer" && callId) {
    const claim = getCallClaim(callId);
    if (claim && claim.byUid !== toUid) {
      return NextResponse.json({ success: false, message: "Call already answered" }, { status: 409 });
    }
  }
  emitToUser(toUid, "internal:signal", {
    system: "internal",
    fromUid: auth.uid,
    toUid,
    conversationId,
    callId,
    callType: call?.callType || null,
    fromName: auth.user.displayName || auth.user.email || "Colleague",
    fromAvatar: auth.user.avatar || "",
    fromRole: auth.role || null,
    fromClientId: body.fromClientId || null,
    toClientId: body.toClientId || null,
    type,
    payload: body.payload || {},
  }, body.toClientId && type !== "offer" ? { onlyClientId: String(body.toClientId) } : undefined);
  return NextResponse.json({ success: true });
}
