import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, createInternalMessage, personOf } from "@/lib/internalChatModel";
import { emitToUser } from "@/lib/sseManager";

const ALLOWED_TYPES = new Set(["text", "image", "file", "voice"]);

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const conversationId = String(body.conversationId || "");
  const conv = await getConversationForParticipant(conversationId, auth.uid);
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });

  const receiverId = conv.participants.find((uid) => uid !== auth.uid);
  const messageType = ALLOWED_TYPES.has(body.messageType) ? body.messageType : "text";
  const content = String(body.content || "").slice(0, 8000);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter((a) => a && typeof a.id === "string").slice(0, 10).map((a) => ({
        id: String(a.id),
        name: String(a.name || "file").slice(0, 200),
        size: Number(a.size) || 0,
        type: String(a.type || "application/octet-stream"),
      }))
    : [];

  if (!content.trim() && attachments.length === 0) {
    return NextResponse.json({ success: false, message: "Message is empty" }, { status: 400 });
  }

  try {
    // Snapshot comes from the conversation document: no extra user lookup.
    const senderSnapshot = personOf(conv, auth.uid) || {
      uid: auth.uid,
      displayName: auth.user.displayName || auth.user.email || "User",
      role: auth.role,
      avatar: auth.user.avatar || null,
    };
    const { message, conversation, duplicate } = await createInternalMessage({
      conversationId,
      senderId: auth.uid,
      receiverId,
      senderSnapshot,
      messageType,
      content,
      attachments,
      voiceMetadata: messageType === "voice" ? { duration: Number(body.voiceMetadata?.duration) || 0 } : null,
      clientId: body.clientId,
    });
    // Echo only once to both members; a retried send is not re-broadcast.
    if (!duplicate) {
      const payload = {
        conversationId,
        message,
        conversation: conversation || conv,
        system: "internal",
      };
      for (const uid of conv.participants) emitToUser(uid, "internal:message", payload);
    }
    return NextResponse.json({ success: true, message, clientId: message.clientId || null, duplicate });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Could not send message" }, { status: 500 });
  }
}
