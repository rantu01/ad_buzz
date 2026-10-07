import { NextResponse } from "next/server";
import { createTicket, getTicketsByUid, addTicketReply, getTicketById, countAttentionTickets, clearTicketReads } from "@/lib/supportTicketModel";
import { emitToChannel } from "@/lib/sseManager";

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
    const { uid, email, subject, message, adAccountId, adAccountMetaId, adAccountName } = body;
    if (!uid || !email || !subject || !message) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    const ticket = await createTicket({ uid, email, subject, message, adAccountId, adAccountMetaId, adAccountName });
    // Notify all connected staff in real time. Never fail ticket creation
    // because the notification fan-out failed.
    try {
      const pendingOpen = await countAttentionTickets();
      emitToChannel("admin:tickets", "ticket.created", {
        ticket: {
          _id: String(ticket._id),
          ticketId: ticket.ticketId,
          subject: ticket.subject,
          email: ticket.email,
          status: ticket.status,
          createdAt: ticket.createdAt,
        },
        pendingOpen,
      });
    } catch { /* notification is best-effort */ }
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

    // Customer followed up: every staff member must see this ticket as
    // unread again, and connected dashboards refresh immediately.
    try {
      await clearTicketReads(ticketId);
      const pendingOpen = await countAttentionTickets();
      emitToChannel("admin:tickets", "ticket.updated", {
        ticket: {
          _id: String(result._id),
          ticketId: result.ticketId,
          subject: result.subject,
          email: result.email,
          status: result.status,
          createdAt: result.createdAt,
        },
        pendingOpen,
      });
    } catch { /* reply already saved; notification is best-effort */ }

    return NextResponse.json({ success: true, ticket: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
