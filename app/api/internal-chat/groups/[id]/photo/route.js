import { NextResponse } from "next/server";
import { requireGroupMember } from "@/lib/groupChatAuth";
import { getConversationForParticipant, updateInternalGroup, getInternalAttachment, saveInternalAttachment } from "@/lib/internalChatModel";
import { getInternalUser } from "@/lib/internalChatModel";
import { isStaffRole } from "@/lib/permissions";
import { isGroupConversation } from "@/lib/groupChat";
import { emitToUser } from "@/lib/sseManager";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = await requireGroupMember(request, id, { adminOnly: true });
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ success: false, message: "file required" }, { status: 400 });
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ success: false, message: "Only image files are allowed" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ success: false, message: "Image must be 5 MB or less" }, { status: 400 });
    const attachment = await saveInternalAttachment({
      uid: auth.uid,
      name: String(file.name || "group-photo").slice(0, 200),
      size: file.size,
      type: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    const conversation = await updateInternalGroup(id, { avatarAttachmentId: attachment.id });
    const payload = { action: "updated", conversationId: id, conversation, byUid: auth.uid, system: "internal" };
    for (const uid of conversation.participants || []) emitToUser(uid, "internal:group", payload);
    return NextResponse.json({ success: true, conversation, attachment });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Upload failed" }, { status: 500 });
  }
}

// <img src> cannot send a Bearer token. The uid query param is verified against
// a real staff account AND group membership before any bytes are returned.
export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const uid = String(searchParams.get("uid") || "");
  const viewer = uid ? await getInternalUser(uid) : null;
  if (!viewer || !isStaffRole(viewer.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }
  const conv = await getConversationForParticipant(id, uid);
  if (!conv || !isGroupConversation(conv)) {
    return NextResponse.json({ success: false, message: "Group not found" }, { status: 404 });
  }
  if (!conv.avatarAttachmentId) {
    return NextResponse.json({ success: false, message: "No group photo" }, { status: 404 });
  }
  const att = await getInternalAttachment(conv.avatarAttachmentId);
  if (!att) return NextResponse.json({ success: false, message: "Photo not found" }, { status: 404 });
  const data = Buffer.from(att.data?.buffer || att.data);
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": att.type || "application/octet-stream",
      "Content-Disposition": "inline",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
