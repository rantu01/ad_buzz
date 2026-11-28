import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import {
  getConversationForParticipant,
  personOf,
  createInternalCall,
  getInternalCall,
  updateInternalCall,
  listInternalCalls,
  createInternalMessage,
  isTerminalCallStatus,
} from "@/lib/internalChatModel";
import { emitToUser, isUidOnline } from "@/lib/sseManager";

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const { action, callId, status, duration } = body || {};

  try {
    if (action === "create") {
      const conversationId = String(body.conversationId || "");
      const conv = await getConversationForParticipant(conversationId, auth.uid);
      if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });

      const peerUid = conv.participants.find((uid) => uid !== auth.uid);
      const receiverId = body.receiverId ? String(body.receiverId) : peerUid;
      if (!receiverId || receiverId === auth.uid || !conv.participants.includes(receiverId)) {
        return NextResponse.json({ success: false, message: "Invalid call receiver" }, { status: 403 });
      }
      const callType = body.callType === "video" ? "video" : "voice";

      // Unavailable receivers are recorded as missed calls instead of ringing
      // forever; the caller is told immediately so the UI can show a toast.
      if (!isUidOnline(receiverId)) {
        const missed = await createInternalCall({ conversationId, initiatorId: auth.uid, receiverId, callType });
        const ended = await updateInternalCall(missed.callId, { status: "missed", endedAt: new Date(), duration: 0 });
        await recordCallEvent(ended, auth, "Missed call (unavailable)", "missed", 0);
        return NextResponse.json({ success: true, call: ended, unavailable: true });
      }

      const call = await createInternalCall({ conversationId, initiatorId: auth.uid, receiverId, callType });
      const from = personOf(conv, auth.uid);
      emitToUser(receiverId, "internal:call", {
        conversationId,
        call,
        fromUid: auth.uid,
        fromName: from?.displayName || auth.user.displayName || auth.user.email || "Colleague",
        system: "internal",
      });
      return NextResponse.json({ success: true, call });
    }

    if (action === "update" && callId) {
      const existing = await getInternalCall(String(callId));
      if (!existing) return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
      const conv = await getConversationForParticipant(existing.conversationId, auth.uid);
      if (!conv) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });

      const nextStatus = String(status || "");
      if (!["accepted", "connected", "ended", "rejected", "missed"].includes(nextStatus)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      const now = new Date();
      const wasTerminal = isTerminalCallStatus(existing.status);
      const updates = {};
      if ((nextStatus === "accepted" || nextStatus === "connected") && !existing.answeredAt) updates.answeredAt = now;
      const effectiveStatus = nextStatus === "ended" && !existing.answeredAt && !updates.answeredAt ? "missed" : nextStatus;
      updates.status = effectiveStatus;
      const terminal = isTerminalCallStatus(effectiveStatus);
      if (terminal && !existing.endedAt) updates.endedAt = now;

      const answeredAt = existing.answeredAt || updates.answeredAt;
      const endedAt = existing.endedAt || updates.endedAt;
      let finalDuration = Number(duration);
      if (!Number.isFinite(finalDuration) || finalDuration < 0) finalDuration = 0;
      if (terminal && ["missed", "rejected"].includes(effectiveStatus)) finalDuration = 0;
      else if (effectiveStatus === "ended" && answeredAt && endedAt) {
        finalDuration = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(answeredAt).getTime()) / 1000));
      } else if (effectiveStatus === "ended" && !answeredAt) finalDuration = 0;
      if (terminal || duration != null) updates.duration = finalDuration;

      const call = await updateInternalCall(existing.callId, updates);
      if (terminal && !wasTerminal) {
        const label = effectiveStatus === "missed" ? "Missed call" : effectiveStatus === "rejected" ? "Call rejected" : "Call ended";
        await recordCallEvent(call, auth, label, effectiveStatus, finalDuration);
      }
      return NextResponse.json({ success: true, call });
    }
    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Call request failed" }, { status: 500 });
  }
}

async function recordCallEvent(call, actor, label, status, duration) {
  const conv = await getConversationForParticipant(call.conversationId, actor.uid);
  const sender = personOf(conv, actor.uid) || {
    uid: actor.uid,
    displayName: actor.user?.displayName || actor.user?.email || "User",
    role: actor.role,
    avatar: actor.user?.avatar || null,
  };
  const { message, conversation } = await createInternalMessage({
    conversationId: call.conversationId,
    senderId: actor.uid,
    receiverId: call.initiatorId === actor.uid ? call.receiverId : call.initiatorId,
    senderSnapshot: sender,
    messageType: "call_event",
    content: label,
    callMetadata: {
      callId: call.callId,
      callType: call.callType,
      status,
      duration: status === "ended" ? duration : 0,
      startedAt: call.answeredAt || null,
      endedAt: call.endedAt || new Date(),
    },
  });
  const target = conversation || conv;
  for (const uid of target?.participants || []) {
    emitToUser(uid, "internal:message", { conversationId: call.conversationId, message, conversation: target, system: "internal" });
  }
  return message;
}

export async function GET(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const conv = await getConversationForParticipant(searchParams.get("conversationId"), auth.uid);
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
  const calls = await listInternalCalls(conv.conversationId, searchParams.get("limit") || 50);
  return NextResponse.json({ success: true, calls });
}
