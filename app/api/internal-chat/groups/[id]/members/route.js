import { NextResponse } from "next/server";
import { requireGroupMember } from "@/lib/groupChatAuth";
import {
  addInternalGroupMembers,
  removeInternalGroupMember,
  setInternalGroupAdmin,
  getInternalUsersByUids,
} from "@/lib/internalChatModel";
import { canRemoveMember, isGroupAdmin, GROUP_ADMIN, GROUP_MEMBER } from "@/lib/groupChat";
import { emitToUser } from "@/lib/sseManager";

async function broadcast(conversation, action, byUid, extra = {}) {
  const payload = { action, conversationId: conversation.conversationId, conversation, byUid, system: "internal", ...extra };
  for (const uid of conversation.participants || []) emitToUser(uid, "internal:group", payload);
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id, { adminOnly: true });
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const requested = [...new Set((Array.isArray(body?.uids) ? body.uids : [body?.uid]).filter(Boolean).map(String))];
  if (!requested.length) return NextResponse.json({ success: false, message: "Select at least one user" }, { status: 400 });
  const already = new Set(auth.conv.participants || []);
  const uids = requested.filter((uid) => !already.has(uid));
  if (!uids.length) return NextResponse.json({ success: false, message: "Already a member" }, { status: 400 });
  if ((already.size + uids.length) > 50) {
    return NextResponse.json({ success: false, message: "A group can have at most 50 members" }, { status: 400 });
  }
  try {
    const users = await getInternalUsersByUids(uids);
    if (users.length !== uids.length) {
      return NextResponse.json({ success: false, message: "One or more users were not found" }, { status: 404 });
    }
    const conversation = await addInternalGroupMembers(id, uids);
    await broadcast(conversation, "members-added", auth.uid, { addedUids: uids });
    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id, { adminOnly: true });
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const uid = String(searchParams.get("uid") || "");
  if (!canRemoveMember(auth.conv, auth.uid, uid)) {
    return NextResponse.json({ success: false, message: "That member cannot be removed" }, { status: 403 });
  }
  try {
    const conversation = await removeInternalGroupMember(id, uid);
    await broadcast(conversation, "member-removed", auth.uid, { removedUid: uid });
    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id, { adminOnly: true });
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const uid = String(body?.uid || "");
  const role = String(body?.role || "");
  if (!uid || !(auth.conv.participants || []).includes(uid)) {
    return NextResponse.json({ success: false, message: "Member not found" }, { status: 404 });
  }
  if (uid === auth.conv.createdBy && role !== GROUP_ADMIN) {
    return NextResponse.json({ success: false, message: "The group creator must remain an admin" }, { status: 403 });
  }
  if (uid === auth.uid && role !== GROUP_ADMIN && isGroupAdmin(auth.conv, uid)) {
    return NextResponse.json({ success: false, message: "You cannot demote yourself" }, { status: 403 });
  }
  if (![GROUP_ADMIN, GROUP_MEMBER].includes(role)) {
    return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
  }
  try {
    const conversation = await setInternalGroupAdmin(id, uid, role === GROUP_ADMIN);
    await broadcast(conversation, "role-changed", auth.uid, { uid, role });
    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
