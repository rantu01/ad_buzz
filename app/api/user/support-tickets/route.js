import { NextResponse } from "next/server";
import { createTicket, getTicketsByUid, addTicketReply, getTicketById } from "@/lib/supportTicketModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ success: false, message: "UID required" }, { status: 400 });
    const tickets = await getTicketsByUid(uid);
    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email, subject, message } = body;
    if (!uid || !email || !subject || !message) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    const ticket = await createTicket({ uid, email, subject, message });
    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { ticketId, uid, message, userName } = body;

    if (!ticketId || !uid || !message) {
      return NextResponse.json({ success: false, message: "ticketId, uid, and message required" }, { status: 400 });
    }

    const ticket = await getTicketById(ticketId);
    if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    if (ticket.uid !== uid) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    if (ticket.status === "closed") return NextResponse.json({ success: false, message: "Ticket is closed" }, { status: 400 });

    const result = await addTicketReply(ticketId, { text: message, by: userName || "You", role: "customer" });
    if (!result) return NextResponse.json({ success: false, message: "Failed to add reply" }, { status: 500 });

    return NextResponse.json({ success: true, ticket: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
