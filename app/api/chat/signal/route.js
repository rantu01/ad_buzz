import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/chatModel";
import { emitToUser, emitToChannel, isUidOnline } from "@/lib/sseManager";

// System A (customer support chat) signaling. Event names and payload fields
// are unchanged; the additions are a staff-channel fallback for unreachable
// targets (customers could not reach an admin when no staff was assigned) and
// an "accepted" claim marker so the first accepting staff wins.
export async function POST(request) {
  try {
    const body = await request.json();
    const { fromUid, toUid, conversationId, callId, type, payload } = body || {};
    if (!fromUid || !type) return NextResponse.json({ success: false, message: "fromUid and type required" }, { status: 400 });
    const fromUser = await getUserByUid(fromUid);
    if (!fromUser) return NextResponse.json({ success: false, message: "Sender not found" }, { status: 404 });
    const eventPayload = {
      fromUid,
      toUid,
      conversationId,
      callId,
      type,
      payload,
      fromName: fromUser.displayName || fromUser.email,
      fromAvatar: fromUser.avatar || "",
      fromRole: fromUser.role,
      system: "customer",
    };

    const reachable = Boolean(toUid) && isUidOnline(toUid);
    if (reachable) {
      emitToUser(toUid, "chat:signal", eventPayload);
    } else if (toUid || type === "offer") {
      // No live SSE client for the assigned staff (or no assignment at all):
      // let any online staff member pick the call up from the staff channel.
      emitToChannel("admin:chat", "chat:signal", eventPayload);
    }

    // Claim marker: other staff tabs with the same incoming call stop ringing.
    if (type === "accepted" && callId) {
      emitToChannel("admin:chat", "chat:signal", {
        ...eventPayload,
        type: "accepted",
        byUid: fromUid,
      });
    }
    return NextResponse.json({ success: true, delivered: reachable || (!toUid && type === "offer") });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
