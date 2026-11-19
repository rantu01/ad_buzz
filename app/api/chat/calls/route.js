import { NextResponse } from "next/server";
import { createCall, updateCall, getCall, listCalls } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";
import { emitToUser, emitToChannel } from "@/lib/sseManager";

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, conversationId, callType, action, callId, status, duration, receiverId } = body || {};
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    if (action === "create") {
      if (!conversationId || !callType) return NextResponse.json({ success: false, message: "conversationId and callType required" }, { status: 400 });
      const call = await createCall({ conversationId, initiatorId: uid, receiverId: receiverId || null, callType });
      // notify other party
      const conv = await (await import("@/lib/chatModel")).getConversationById(conversationId);
      const payload = { conversationId, call };
      if (conv) {
        if (conv.customerId !== uid) emitToUser(conv.customerId, "chat:call", payload);
        emitToChannel("admin:chat", "chat:call", payload);
        if (conv.assignedStaffId && conv.assignedStaffId !== uid) emitToUser(conv.assignedStaffId, "chat:call", payload);
      }
      return NextResponse.json({ success: true, call });
    }
    if (action === "update" && callId) {
      const existing = await getCall(callId);
      if (!existing) return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
      const now = new Date();
      const wasTerminal = existing.status === "ended" || existing.status === "rejected" || existing.status === "missed";
      const updates = {};
      if (status === "accepted" && !existing.answeredAt) updates.answeredAt = now;
      const effectiveStatus = status === "ended" && !existing.answeredAt && !updates.answeredAt ? "missed" : status;
      if (effectiveStatus) updates.status = effectiveStatus;
      const isEffectiveTerminal = effectiveStatus === "ended" || effectiveStatus === "rejected" || effectiveStatus === "missed";
      if (isEffectiveTerminal && !existing.endedAt) updates.endedAt = now;
      const answeredAt = existing.answeredAt || updates.answeredAt;
      const endedAt = existing.endedAt || updates.endedAt;
      let finalDuration = Number(duration);
      if (!Number.isFinite(finalDuration) || finalDuration < 0) finalDuration = 0;
      // Ringing and unanswered time is excluded. For completed calls, the
      // server timestamps are authoritative and synchronized for both users.
      if (effectiveStatus === "missed" || effectiveStatus === "rejected") {
        finalDuration = 0;
      } else if (effectiveStatus === "ended" && answeredAt && endedAt) {
        finalDuration = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(answeredAt).getTime()) / 1000));
      } else if (effectiveStatus === "ended" && !answeredAt) {
        finalDuration = 0;
      }
      if (isEffectiveTerminal || duration != null) updates.duration = finalDuration;
      if (effectiveStatus === "missed" || effectiveStatus === "rejected") updates.duration = 0;
      const call = await updateCall(callId, updates);
      // create call_event message once per call on end/missed/rejected
      if (isEffectiveTerminal && !wasTerminal) {
        const { createMessage } = await import("@/lib/chatModel");
        const evStatus = effectiveStatus === "missed" ? "Missed call" : effectiveStatus === "rejected" ? "Call rejected" : "Call ended";
        await createMessage({
          conversationId: call.conversationId,
          senderId: uid,
          senderType: "system",
          senderRole: null,
          senderNameSnapshot: "System",
          messageType: "call_event",
          content: evStatus,
          callMetadata: { callId, callType: call.callType, status: effectiveStatus, duration: effectiveStatus === "ended" ? finalDuration : 0, startedAt: call.answeredAt || null, endedAt: call.endedAt || now },
        });
        const conv = await (await import("@/lib/chatModel")).getConversationById(call.conversationId);
        const msgPayload = { conversationId: call.conversationId, conversation: conv };
        if (conv) {
          if (conv.customerId !== uid) emitToUser(conv.customerId, "chat:message", msgPayload);
          emitToChannel("admin:chat", "chat:message", msgPayload);
        }
      }
      return NextResponse.json({ success: true, call });
    }
    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const conversationId = searchParams.get("conversationId");
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    if (conversationId) {
      const calls = await listCalls(conversationId);
      return NextResponse.json({ success: true, calls });
    }
    return NextResponse.json({ success: false, message: "conversationId required" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
