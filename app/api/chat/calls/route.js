import { NextResponse } from "next/server";
import {
  createCall,
  updateCall,
  getCall,
  listCalls,
  getConversationById,
  assignConversation,
  getStaffUsers,
} from "@/lib/chatModel";
import { resolveChatCaller } from "@/lib/chatCallAuth";
import { isStaffRole } from "@/lib/permissions";
import { emitToUser, isUidOnline, getOnlineUids, claimCall, setCallClaimStatus } from "@/lib/sseManager";
import { buildCallUpdates, isTerminalCallStatus } from "@/lib/callState";

const RING_WINDOW_MS = 45 * 1000;

// All call notifications are targeted at conversation/call participants. No
// `admin:chat` broadcast: an incoming call must never ring an unrelated role.
function participantUids(conv, call) {
  return [...new Set([
    conv?.customerId,
    conv?.assignedStaffId,
    call?.initiatorId,
    call?.receiverId,
  ].filter(Boolean))];
}

function notifyParticipants(conv, call, event, data, excludeUid = null) {
  for (const uid of participantUids(conv, call)) {
    if (excludeUid && uid === excludeUid) continue;
    emitToUser(uid, event, data);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const caller = await resolveChatCaller(request, body?.uid);
    if (!caller.ok) return NextResponse.json({ success: false, message: caller.message }, { status: caller.status });

    const { conversationId, callType, action, callId, status, duration, receiverId, fromClientId } = body || {};
    const uid = caller.uid;
    const callerIsStaff = isStaffRole(caller.user.role);

    if (action === "create") {
      if (!conversationId || !callType) {
        return NextResponse.json({ success: false, message: "conversationId and callType required" }, { status: 400 });
      }
      const conv = await getConversationById(String(conversationId));
      if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
      if (!callerIsStaff && conv.customerId !== uid) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }

      // A customer may reach only staff; staff may reach only the conversation
      // customer. An explicitly supplied receiver is validated, never trusted.
      let targetUid = receiverId ? String(receiverId) : (callerIsStaff ? conv.customerId : conv.assignedStaffId || null);
      if (targetUid && targetUid === uid) {
        return NextResponse.json({ success: false, message: "Invalid receiver" }, { status: 400 });
      }
      if (targetUid) {
        const target = await getStaffOrCustomer(targetUid);
        const targetIsStaff = Boolean(target && isStaffRole(target.role));
        if (!target || (callerIsStaff ? targetIsStaff : !targetIsStaff)) {
          return NextResponse.json({ success: false, message: "Invalid receiver" }, { status: 403 });
        }
      }
      // Unassigned (or assigned-but-offline) conversations: pick ONE reachable
      // staff member. This keeps the ringtone with a specific recipient instead
      // of broadcasting it to every admin/employee device.
      if (!callerIsStaff && (!targetUid || !isUidOnline(targetUid))) {
        const onlineStaff = (await getStaffUsers()).filter((s) => isUidOnline(s.uid));
        targetUid = onlineStaff[0]?.uid || (targetUid && !onlineStaff.length ? targetUid : null);
      }

      // Reuse a call that is still ringing instead of creating duplicate
      // sessions when the caller double-clicks or reconnects.
      const recent = await listCalls(conv.conversationId, 10);
      const duplicate = recent.find((c) =>
        c.status === "ringing" &&
        c.initiatorId === uid &&
        c.receiverId === (targetUid || null) &&
        Date.now() - new Date(c.startedAt || c.createdAt || 0).getTime() < RING_WINDOW_MS
      );
      if (duplicate) {
        return NextResponse.json({ success: true, call: duplicate, existing: true });
      }

      const reachable = Boolean(targetUid) && isUidOnline(targetUid);
      const call = await createCall({
        conversationId: conv.conversationId,
        initiatorId: uid,
        receiverId: targetUid,
        callType: callType === "video" ? "video" : "voice",
      });
      if (!reachable) {
        const ended = await updateCall(call.callId, { status: "missed", endedAt: new Date(), duration: 0 });
        return NextResponse.json({ success: true, call: ended, unavailable: true, message: "No one is available to answer right now." });
      }

      const payload = { conversationId: conv.conversationId, call, system: "customer" };
      emitToUser(targetUid, "chat:call", payload);
      emitToUser(targetUid, "chat:call-status", { ...payload, status: "ringing" });
      // The caller's other devices must also see the new call in sync.
      for (const participant of participantUids(conv, call)) {
        if (participant !== targetUid) emitToUser(participant, "chat:call-status", { ...payload, status: "ringing" });
      }
      return NextResponse.json({ success: true, call });
    }

    if (action === "update" && callId) {
      const existing = await getCall(String(callId));
      if (!existing) return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
      const callConv = await getConversationById(existing.conversationId);
      if (!callConv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });

      const isParticipant = [existing.initiatorId, existing.receiverId, callConv.customerId].filter(Boolean).includes(uid);
      const staffSender = callerIsStaff && isParticipant;
      if (!isParticipant && !staffSender) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }
      if (callerIsStaff && !isParticipant && existing.initiatorId !== callConv.customerId) {
        return NextResponse.json({ success: false, message: "Not your call" }, { status: 403 });
      }

      const result = buildCallUpdates({ existing, status, duration });
      if (!result.changed) {
        // Still return the persisted record: an already-accepted call queried
        // by a second device must not be resurrected or re-answered.
        return NextResponse.json({ success: true, call: existing, unchanged: true });
      }

      let claimInfo = null;
      if (result.effectiveStatus === "accepted") {
        const claim = claimCall({ callId: existing.callId, uid, clientId: fromClientId ? String(fromClientId) : null });
        if (!claim.claimed) {
          return NextResponse.json({
            success: true,
            call: existing,
            claimedByOther: true,
            claim: { byUid: claim.claim?.byUid || null, byClientId: claim.claim?.byClientId || null },
          });
        }
        claimInfo = claim.claim;
      }
      if (isTerminalCallStatus(result.effectiveStatus)) setCallClaimStatus(existing.callId, result.effectiveStatus);

      // The first accepting staff member owns an unassigned conversation.
      if (result.effectiveStatus === "accepted" && callerIsStaff && !callConv.assignedStaffId) {
        await assignConversation(existing.conversationId, uid, caller.user.displayName || caller.user.email || null);
      }

      const call = await updateCall(existing.callId, result.updates);
      // Accepting an unassigned call assigns it server-side; refresh so the
      // new owner's devices are included in status/message fan-out.
      const notifyConv = result.effectiveStatus === "accepted" && callerIsStaff && !callConv.assignedStaffId
        ? (await getConversationById(call.conversationId)) || callConv
        : callConv;
      const statusPayload = {
        conversationId: call.conversationId,
        call,
        status: result.effectiveStatus,
        byUid: uid,
        byClientId: fromClientId ? String(fromClientId) : null,
        claim: claimInfo ? { byUid: claimInfo.byUid, byClientId: claimInfo.byClientId } : null,
        system: "customer",
      };
      notifyParticipants(notifyConv, call, "chat:call-status", statusPayload);

      if (result.newlyTerminal) {
        const { createMessage } = await import("@/lib/chatModel");
        const evStatus = result.effectiveStatus === "missed" ? "Missed call"
          : result.effectiveStatus === "rejected" ? "Call rejected"
          : result.effectiveStatus === "cancelled" ? "Call cancelled" : "Call ended";
        await createMessage({
          conversationId: call.conversationId,
          senderId: uid,
          senderType: "system",
          senderRole: null,
          senderNameSnapshot: "System",
          messageType: "call_event",
          content: evStatus,
          callMetadata: {
            callId,
            callType: call.callType,
            status: result.effectiveStatus,
            duration: result.effectiveStatus === "ended" ? result.finalDuration : 0,
            startedAt: call.answeredAt || null,
            endedAt: call.endedAt || new Date(),
          },
        });
        const freshConv = await getConversationById(call.conversationId);
        const msgPayload = { conversationId: call.conversationId, conversation: freshConv, system: "customer" };
        notifyParticipants(freshConv, call, "chat:message", msgPayload);
      }
      return NextResponse.json({ success: true, call });
    }
    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

async function getStaffOrCustomer(uid) {
  // getUserByUid is re-exported by chatModel; keep the call in one place so the
  // receiver-role check above stays readable.
  const { getUserByUid } = await import("@/lib/chatModel");
  return getUserByUid(uid);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const caller = await resolveChatCaller(request, searchParams.get("uid"));
    if (!caller.ok) return NextResponse.json({ success: false, message: caller.message }, { status: caller.status });
    const conversationId = searchParams.get("conversationId");
    if (!conversationId) return NextResponse.json({ success: false, message: "conversationId required" }, { status: 400 });
    const conv = await getConversationById(conversationId);
    if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    const allowed = conv.customerId === caller.uid || isStaffRole(caller.user.role);
    if (!allowed) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const calls = await listCalls(conversationId);
    return NextResponse.json({ success: true, calls });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
