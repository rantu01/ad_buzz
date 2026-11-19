import { NextResponse } from "next/server";
import { getTicketById } from "@/lib/supportTicketModel";
import { saveTicketAttachment, getTicketAttachment } from "@/lib/supportTicketModel";
import { getUserByUid } from "@/lib/userModel";
import { isStaffRole } from "@/lib/permissions";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function authorizeTicket(ticket, uid) {
  if (!ticket || !uid) return false;
  if (ticket.uid === uid) return true;
  const user = await getUserByUid(uid);
  if (user && isStaffRole(user.role)) return true;
  return false;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const uid = formData.get("uid");
    const file = formData.get("file");
    if (!uid || !file || typeof file === "string") {
      return NextResponse.json({ success: false, message: "uid and file required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, message: "Only JPG, PNG and PDF files are allowed." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "File size must be 10 MB or less." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await saveTicketAttachment({
      uid: String(uid),
      name: file.name,
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
  try {
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get("ticketId");
    const attachmentId = searchParams.get("attachmentId");
    const uid = searchParams.get("uid");
    if (!ticketId || !attachmentId || !uid) {
      return NextResponse.json({ success: false, message: "ticketId, attachmentId and uid required" }, { status: 400 });
    }
    const ticket = await getTicketById(ticketId);
    if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    if (!(await authorizeTicket(ticket, uid))) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const att = (ticket.attachments || []).find((a) => String(a.id) === String(attachmentId));
    if (!att) return NextResponse.json({ success: false, message: "Attachment not found" }, { status: 404 });

    const fileDoc = await getTicketAttachment(attachmentId);
    if (!fileDoc) return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });

    const data = Buffer.from(fileDoc.data.buffer || fileDoc.data);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": fileDoc.type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileDoc.name)}"`,
        "Content-Length": String(data.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Download failed" }, { status: 500 });
  }
}