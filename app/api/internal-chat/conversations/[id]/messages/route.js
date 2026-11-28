import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, getInternalMessagesPage } from "@/lib/internalChatModel";
import { getUsersByUids, attachCurrentAvatars } from "@/lib/chatModel";

export async function GET(request, { params }) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  const { id } = await params;
  const conv = await getConversationForParticipant(id, auth.uid);
  if (!conv) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const { messages, hasMore, nextCursor } = await getInternalMessagesPage(conv.conversationId, {
    before: searchParams.get("before"),
    limit: searchParams.get("limit") || 25,
  });
  const users = await getUsersByUids(messages.map((message) => message.senderId));
  // Additive fields: existing clients that only read `messages` are unchanged.
  return NextResponse.json({ success: true, messages: attachCurrentAvatars(messages, users), hasMore, nextCursor });
}
