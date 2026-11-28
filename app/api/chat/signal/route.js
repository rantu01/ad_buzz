import { NextResponse } from "next/server";
import { getConversationById, getCall, getUserByUid } from "@/lib/chatModel";
import { resolveChatCaller } from "@/lib/chatCallAuth";
import { isStaffRole } from "@/lib/permissions";
import { emitToUser, isUidOnline, getCallClaim } from "@/lib/sseManager";

const SIGNAL_TYPES = new Set(["offer", "answer", "ice", "end", "cancel", "reject", "missed", "accepted", "media", "renegotiate", "renegotiate-answer"]);

// System A (customer support chat) signaling.
//
// Incoming-call privacy rule: signals are delivered to ONE explicitly resolved
// recipient uid. There is no channel fallback — broadcasting an offer to
// `admin:chat` meant every staff tab on every device rang for a call meant for
// a single person. Unreachable targets simply report `delivered: false`; the
// caller's existing timeout records the call as missed.
export async function POST(request) {
  try {
    const body = await request.json();
    const { conversationId, callId, type, payload } = body || {};
    const caller = await resolveChatCaller(request, body?.fromUid);
    if (!caller.ok) return NextResponse.json({ success: false, message: caller.message }, { status: caller.status });

    const signalType = String(type || "");
    if (!SIGNAL_TYPES.has(signalType)) {
      return NextResponse.json({ success: false, message: "Invalid signal type" }, { status: 400 });
    }
    const toUid = body?.toUid ? String(body.toUid) : "";
    if (!toUid) {
      return NextResponse.json({ success: false, message: "Signal recipient is required", delivered: false }, { status: 400 });
    }
    if (toUid === caller.uid) {
      return NextResponse.json({ success: false, message: "Invalid signal recipient", delivered: false }, { status: 403 });
    }

    const conv = conversationId ? await getConversationById(String(conversationId)) : null;
    if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    const call = callId ? await getCall(String(callId)) : null;
    if (callId && (!call || call.conversationId !== conv.conversationId)) {
      return NextResponse.json({ success: false, message: "Invalid call" }, { status: 403 });
    }

    const callerIsStaff = isStaffRole(caller.user.role);
    const participantUids = new Set([
      conv.customerId,
      conv.assignedStaffId,
      call?.initiatorId,
      call?.receiverId,
    ].filter(Boolean));
    // Membership is authoritative: neither a customer nor a staff member may
    // inject a signal into a conversation/call they are not part of.
    if (!participantUids.has(caller.uid)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    if (call && ![call.initiatorId, call.receiverId].includes(caller.uid)) {
      return NextResponse.json({ success: false, message: "Not your call" }, { status: 403 });
    }
    if (!participantUids.has(toUid)) {
      return NextResponse.json({ success: false, message: "Invalid signal recipient", delivered: false }, { status: 403 });
    }
    const targetUser = await getUserByUid(toUid);
    if (!targetUser) {
      return NextResponse.json({ success: false, message: "Recipient not found", delivered: false }, { status: 404 });
    }
    // A customer may only signal staff and vice versa.
    if (callerIsStaff === isStaffRole(targetUser.role)) {
      return NextResponse.json({ success: false, message: "Invalid signal recipient", delivered: false }, { status: 403 });
    }
    // An accepted call already has an owner; a second device of the recipient
    // must not create a duplicate call session.
    if (signalType === "offer") {
      const claim = getCallClaim(String(callId || ""));
      if (claim && claim.byUid !== toUid) {
        return NextResponse.json({ success: false, message: "Call already answered", delivered: false }, { status: 409 });
      }
    }
    if (!isUidOnline(toUid)) {
      return NextResponse.json({ success: false, message: "Recipient is offline", delivered: false }, { status: 200 });
    }

    const eventPayload = {
      fromUid: caller.uid,
      toUid,
      conversationId: conv.conversationId,
      callId: callId || null,
      callType: call?.callType || null,
      type: signalType,
      payload: payload || {},
      fromName: caller.user.displayName || caller.user.email,
      fromAvatar: caller.user.avatar || "",
      fromRole: caller.user.role,
      fromClientId: body?.fromClientId || null,
      toClientId: body?.toClientId || null,
      system: "customer",
    };
    emitToUser(toUid, "chat:signal", eventPayload, body?.toClientId ? { onlyClientId: String(body.toClientId) } : undefined);
    return NextResponse.json({ success: true, delivered: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
