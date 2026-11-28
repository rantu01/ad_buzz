import { NextResponse } from "next/server";
import { requireGroupMember } from "@/lib/groupChatAuth";
import { removeInternalGroupMember } from "@/lib/internalChatModel";
import { canLeaveGroup } from "@/lib/groupChat";
import { emitToUser } from "@/lib/sseManager";

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  if (!canLeaveGroup(auth.conv, auth.uid)) {
    return NextResponse.json({ success: false, message: "The group creator cannot leave. Delete the group instead." }, { status: 403 });
  }
  try {
    const conversation = await removeInternalGroupMember(id, auth.uid);
    const payload = { action: "member-left", conversationId: id, conversation, byUid: auth.uid, system: "internal" };
    for (const uid of conversation.participants || []) emitToUser(uid, "internal:group", payload);
    // The leaving member must refresh their own list too.
    emitToUser(auth.uid, "internal:group", { ...payload, action: "deleted-for-me" });
    return NextResponse.json({ success: true, conversationId: id });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
