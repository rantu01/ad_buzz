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
} from "@/lib/internalChatModel";
import { emitToUser, isUidOnline, claimCall, setCallClaimStatus } from "@/lib/sseManager";
import { buildCallUpdates, isTerminalCallStatus } from "@/lib/callState";

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
      // In a group a call must name the member being called; never pick one
      // implicitly from the member list.
      const receiverId = conv.type === "group"
        ? (body.receiverId ? String(body.receiverId) : "")
        : (body.receiverId ? String(body.receiverId) : peerUid);
      if (!receiverId || receiverId === auth.uid || !conv.participants.includes(receiverId)) {
        return NextResponse.json({ success: false, message: "Invalid call receiver" }, { status: 403 });
      }
      const callType = body.callType === "video" ? "video" : "voice";

      // Reuse a ringing call instead of opening a second WebRTC session when
      // the caller double-clicks or an SSE reconnect replays the request.
      const recent = await listInternalCalls(conversationId, 10);
      const duplicate = recent.find((c) =>
        c.status === "ringing" && c.initiatorId === auth.uid && c.receiverId === receiverId &&
        Date.now() - new Date(c.startedAt || c.createdAt || 0).getTime() < 45 * 1000
      );
      if (duplicate) return NextResponse.json({ success: true, call: duplicate, existing: true });

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
      const callNotice = {
        conversationId,
        call,
        fromUid: auth.uid,
        fromName: from?.displayName || auth.user.displayName || auth.user.email || "Colleague",
        system: "internal",
      };
      // Only the single selected member is notified. Group conversations reuse
      // this route, but a call still addresses one concrete member.
      emitToUser(receiverId, "internal:call", callNotice);
      emitToUser(receiverId, "internal:call-status", { ...callNotice, status: "ringing" });
      for (const member of conv.participants || []) {
        if (member !== receiverId) emitToUser(member, "internal:call-status", { ...callNotice, status: "ringing" });
      }
      return NextResponse.json({ success: true, call });
    }

    if (action === "update" && callId) {
      const existing = await getInternalCall(String(callId));
      if (!existing) return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
      const conv = await getConversationForParticipant(existing.conversationId, auth.uid);
      if (!conv) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });

      const result = buildCallUpdates({ existing, status, duration });
      if (!result.changed) {
        return NextResponse.json({ success: true, call: existing, unchanged: true });
      }

      let claim = null;
      if (result.effectiveStatus === "accepted") {
        const claimResult = claimCall({
          callId: existing.callId,
          uid: auth.uid,
          clientId: body.fromClientId ? String(body.fromClientId) : null,
        });
        if (!claimResult.claimed) {
          return NextResponse.json({
            success: true,
            call: existing,
            claimedByOther: true,
            claim: { byUid: claimResult.claim?.byUid || null, byClientId: claimResult.claim?.byClientId || null },
          });
        }
        claim = claimResult.claim;
      }
      if (isTerminalCallStatus(result.effectiveStatus)) setCallClaimStatus(existing.callId, result.effectiveStatus);

      const call = await updateInternalCall(existing.callId, result.updates);
      // Every device of every member sees the same authoritative status, which
      // is what stops other devices from ringing after an accept/end/reject.
      for (const member of conv.participants || []) {
        emitToUser(member, "internal:call-status", {
          conversationId: call.conversationId,
          call,
          status: result.effectiveStatus,
          byUid: auth.uid,
          byClientId: body.fromClientId ? String(body.fromClientId) : null,
          claim: claim ? { byUid: claim.byUid, byClientId: claim.byClientId } : null,
          system: "internal",
        });
      }
      if (result.newlyTerminal) {
        const label = result.effectiveStatus === "missed" ? "Missed call"
          : result.effectiveStatus === "rejected" ? "Call rejected"
          : result.effectiveStatus === "cancelled" ? "Call cancelled" : "Call ended";
        await recordCallEvent(call, auth, label, result.effectiveStatus, result.finalDuration);
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
  const isGroup = conv?.type === "group";
  const { message, conversation } = await createInternalMessage({
    conversationId: call.conversationId,
    senderId: actor.uid,
    receiverId: isGroup ? null : (call.initiatorId === actor.uid ? call.receiverId : call.initiatorId),
    audienceUids: isGroup ? conv.participants : null,
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
