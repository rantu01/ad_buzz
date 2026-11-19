import { NextResponse } from "next/server";
import { getOrCreateConversation, getMessages, createMessage, markRead, getConversationByCustomer } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { emitToUser, emitToChannel } from "@/lib/sseManager";
import { createNotification, createNotificationsForUids } from "@/lib/notificationModel";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const conversationId = searchParams.get("conversationId");
    const before = searchParams.get("before") || null;
    const limit = Number(searchParams.get("limit") || 40);
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    let conv = conversationId ? await (await import("@/lib/chatModel")).getConversationById(conversationId) : await getConversationByCustomer(uid);
    if (!conv) conv = await getOrCreateConversation({ customerId: uid, customerName: user.displayName || user.email || "", customerEmail: user.email || "" });
    if (conv.customerId !== uid) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const messages = await getMessages(conv.conversationId, { before, limit });
    return NextResponse.json({ success: true, conversationId: conv.conversationId, messages });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, conversationId, content, messageType = "text", attachments = [], voiceMetadata = null, callMetadata = null } = body || {};
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    let conv = conversationId ? await (await import("@/lib/chatModel")).getConversationById(conversationId) : await getConversationByCustomer(uid);
    if (!conv) conv = await getOrCreateConversation({ customerId: uid, customerName: user.displayName || user.email || "", customerEmail: user.email || "" });
    if (conv.customerId !== uid) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    if (messageType === "text" && (!content || !String(content).trim())) {
      return NextResponse.json({ success: false, message: "Empty message" }, { status: 400 });
    }
    const msg = await createMessage({
      conversationId: conv.conversationId,
      senderId: uid,
      senderType: "customer",
      senderRole: "customer",
      senderNameSnapshot: user.displayName || user.email || "Customer",
      senderAvatar: user.avatar || null,
      messageType,
      content,
      attachments,
      voiceMetadata,
      callMetadata,
    });
    // real-time notify staff
    const payload = { conversationId: conv.conversationId, message: msg, conversation: await (await import("@/lib/chatModel")).getConversationById(conv.conversationId) };
    emitToChannel("admin:chat", "chat:message", payload);
    // also notify assigned staff if any
    if (conv.assignedStaffId) emitToUser(conv.assignedStaffId, "chat:message", payload);
    const notificationBody = String(content || "").trim().slice(0, 120) || "Sent a chat message";
    if (conv.assignedStaffId) {
      const notification = await createNotification({
        uid: conv.assignedStaffId,
        role: "staff",
        type: "chat_message",
        title: user.displayName || user.email || "Customer",
        body: notificationBody,
        link: "/admin/chat",
        refType: "chat",
        refId: conv.conversationId,
      });
      emitToUser(conv.assignedStaffId, "notify", { notification });
    } else {
      const { getStaffUsers } = await import("@/lib/chatModel");
      const staff = await getStaffUsers();
      const notifications = await createNotificationsForUids(staff.map((s) => s.uid), {
        role: "staff",
        type: "chat_message",
        title: user.displayName || user.email || "Customer",
        body: notificationBody,
        link: "/admin/chat",
        refType: "chat",
        refId: conv.conversationId,
      });
      for (const notification of notifications) {
        emitToUser(notification.uid, "notify", { notification });
      }
    }
    return NextResponse.json({ success: true, message: msg, conversationId: conv.conversationId });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
