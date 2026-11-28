import { NextResponse } from "next/server";
import { requireGroupMember } from "@/lib/groupChatAuth";
import { updateInternalGroup, deleteInternalGroup } from "@/lib/internalChatModel";
import { normalizeGroupName, normalizeGroupDescription } from "@/lib/groupChat";
import { emitToUser } from "@/lib/sseManager";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id, { adminOnly: true });
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const updates = {};
  if (body.name !== undefined) {
    const name = normalizeGroupName(body.name);
    if (!name) return NextResponse.json({ success: false, message: "Group name is required" }, { status: 400 });
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = normalizeGroupDescription(body.description);
  if (body.avatarAttachmentId !== undefined) {
    updates.avatarAttachmentId = body.avatarAttachmentId ? String(body.avatarAttachmentId) : null;
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 });
  }
  try {
    const conversation = await updateInternalGroup(id, updates);
    const payload = { action: "updated", conversationId: id, conversation, byUid: auth.uid, system: "internal" };
    for (const uid of conversation.participants || []) emitToUser(uid, "internal:group", payload);
    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id, { adminOnly: true });
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  try {
    const deleted = await deleteInternalGroup(id);
    if (!deleted) return NextResponse.json({ success: false, message: "Group not found" }, { status: 404 });
    const payload = { action: "deleted", conversationId: id, byUid: auth.uid, system: "internal" };
    for (const uid of deleted.participants || []) emitToUser(uid, "internal:group", payload);
    return NextResponse.json({ success: true, conversationId: id });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
