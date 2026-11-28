import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import {
  saveInternalAttachment,
  getInternalAttachment,
  findInternalMessageByAttachment,
  getConversationForParticipant,
  getInternalUser,
} from "@/lib/internalChatModel";
import { isStaffRole } from "@/lib/permissions";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip", "application/x-zip-compressed",
];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, message: "file required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, message: "File type not allowed." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "File size must be 15 MB or less." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await saveInternalAttachment({
      uid: auth.uid,
      name: String(file.name || "file").slice(0, 200),
      size: file.size,
      type: file.type,
      data: buffer,
    });
    return NextResponse.json({ success: true, attachment });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Upload failed" }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // <img src> and <a href> cannot send an Authorization header, so browser
  // subresource requests identify the viewer with a uid query param (the same
  // convention the customer chat uses). API clients may still send a Bearer
  // token. In BOTH cases we require an existing staff account AND membership
  // of the conversation that references the attachment.
  let viewerUid = null;
  const header = request.headers?.get ? request.headers.get("authorization") : "";
  if (/^Bearer\s+/i.test(String(header || "").trim())) {
    const auth = await requireInternalChatUser(request);
    if (auth.ok) viewerUid = auth.uid;
  }
  if (!viewerUid) {
    const uid = String(searchParams.get("uid") || "").trim();
    const user = uid ? await getInternalUser(uid) : null;
    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    viewerUid = uid;
  }

  const attachmentId = searchParams.get("attachmentId");
  const conversationId = searchParams.get("conversationId");
  if (!attachmentId || !conversationId) {
    return NextResponse.json({ success: false, message: "attachmentId and conversationId required" }, { status: 400 });
  }
  const conv = await getConversationForParticipant(conversationId, viewerUid);
  if (!conv) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });

  const message = await findInternalMessageByAttachment(attachmentId);
  if (!message || message.conversationId !== conversationId ||
      !(message.attachments || []).some((a) => a.id === attachmentId)) {
    return NextResponse.json({ success: false, message: "Attachment not found in this conversation" }, { status: 404 });
  }

  const att = await getInternalAttachment(attachmentId);
  if (!att) return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
  const data = Buffer.from(att.data?.buffer || att.data);
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": att.type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.name)}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
