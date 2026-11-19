import { NextResponse } from "next/server";
import { getConversationById, getMessages, createMessage, markRead } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";
import { emitToUser, emitToChannel } from "@/lib/sseManager";
import { ROLE_LABELS } from "@/lib/rbacCatalog";
import { createNotification } from "@/lib/notificationModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const conversationId = searchParams.get("conversationId");
    const before = searchParams.get("before") || null;
    const limit = Number(searchParams.get("limit") || 40);
    if (!uid || !conversationId) return NextResponse.json({ success: false, message: "uid and conversationId required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const conv = await getConversationById(conversationId);
    if (!conv) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    const messages = await getMessages(conversationId, { before, limit });
    return NextResponse.json({ success: true, conversationId, messages });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, conversationId, content, messageType = "text", attachments = [], voiceMetadata = null, callMetadata = null } = body || {};
    if (!uid || !conversationId) return NextResponse.json({ success: false, message: "uid and conversationId required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const conv = await getConversationById(conversationId);
    if (!conv) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    if (messageType === "text" && (!content || !String(content).trim())) {
      return NextResponse.json({ success: false, message: "Empty message" }, { status: 400 });
    }
    const roleLabel = (ROLE_LABELS && ROLE_LABELS[user.role]) || user.role;
    const msg = await createMessage({
      conversationId,
      senderId: uid,
      senderType: "staff",
      senderRole: user.role,
      senderNameSnapshot: user.displayName || user.email || "Staff",
      senderAvatar: user.avatar || null,
      messageType,
      content,
      attachments,
      voiceMetadata,
      callMetadata,
    });
    const payload = { conversationId, message: msg, conversation: await getConversationById(conversationId) };
    // notify customer
    emitToUser(conv.customerId, "chat:message", payload);
    const notificationBody = String(content || "").trim().slice(0, 120) || (messageType === "voice" ? "Sent a voice message" : "Sent a chat message");
    const notification = await createNotification({
      uid: conv.customerId,
      role: "customer",
      type: "chat_message",
      title: user.displayName || user.email || "Support",
      body: notificationBody,
      link: "/user-dashboard/chat",
      refType: "chat",
      refId: conv.conversationId,
    });
    emitToUser(conv.customerId, "notify", { notification });
    // notify other staff
    emitToChannel("admin:chat", "chat:message", payload);
    return NextResponse.json({ success: true, message: msg });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
