import { NextResponse } from "next/server";
import { saveChatAttachment, getChatAttachment } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";

const ALLOWED_TYPES = [
  "image/jpeg","image/png","image/webp","image/gif",
  "application/pdf","text/plain",
  "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip","application/x-zip-compressed",
];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const uid = formData.get("uid");
    const file = formData.get("file");
    if (!uid || !file || typeof file === "string") {
      return NextResponse.json({ success: false, message: "uid and file required" }, { status: 400 });
    }
    const user = await getUserByUid(String(uid));
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, message: "File type not allowed." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "File size must be 15 MB or less." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await saveChatAttachment({ uid: String(uid), name: file.name, size: file.size, type: file.type, data: buffer });
    return NextResponse.json({ success: true, attachment });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get("attachmentId");
    const uid = searchParams.get("uid");
    if (!attachmentId || !uid) return NextResponse.json({ success: false, message: "attachmentId and uid required" }, { status: 400 });
    const user = await getUserByUid(String(uid));
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    const att = await getChatAttachment(attachmentId);
    if (!att) return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
    // authorization: owner or staff
    const isOwner = att.uid === uid;
    const isStaff = ["admin","director","hr","key_manager","accounts_manager","approval_manager","support_executive","technical_manager"].includes(user.role);
    let allowed = isOwner || isStaff;
    if (!allowed) {
      // Allow a customer to download an attachment that is referenced in one of
      // their own conversations (e.g. a staff reply with a file).
      try {
        const clientModule = await import("@/lib/mongodb");
        const clientPromise = clientModule.default;
        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");
        const msg = await db.collection("chatMessages").findOne({ "attachments.id": attachmentId });
        if (msg) {
          const conv = await db.collection("chatConversations").findOne({ conversationId: msg.conversationId });
          if (conv && conv.customerId === uid) allowed = true;
        }
      } catch {}
    }
    if (!allowed) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const data = Buffer.from(att.data.buffer || att.data);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": att.type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(att.name)}"`,
        "Content-Length": String(data.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
