import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAllTickets, getTicketById, updateTicketStatus, addTicketReply, countAttentionTickets, markTicketsRead } from "@/lib/supportTicketModel";
import { emitToChannel } from "@/lib/sseManager";

// Broadcast a ticket change to connected staff so sidebar badges and lists
// stay in sync. Best-effort: must never break the ticket mutation itself.
async function emitTicketUpdated(ticket) {
  if (!ticket) return;
  try {
    const pendingOpen = await countAttentionTickets();
    emitToChannel("admin:tickets", "ticket.updated", {
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
  } catch { /* ignore */ }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const ticketId = searchParams.get("ticketId");
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");
    const id = searchParams.get("id");
    // Single full ticket for the detail pane (replies included).
    if (id) {
      if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      const ticket = await getTicketById(id);
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ success: true, ticket });
    }
    const result = await getAllTickets(status || null, ticketId || null, { page, limit });
    // Paged shape when ?page=&limit= are given; legacy array otherwise.
    if (result && Array.isArray(result.tickets)) {
      return NextResponse.json({ success: true, ...result });
    }
    return NextResponse.json({ success: true, tickets: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { ticketId, action, reply, staffName, staffRole, uid: actorUid } = body;

    if (!ticketId || !action) {
      return NextResponse.json({ success: false, message: "ticketId and action required" }, { status: 400 });
    }

    if (action === "reply") {
      if (!reply) {
        return NextResponse.json({ success: false, message: "reply text required" }, { status: 400 });
      }
      const ticket = await addTicketReply(ticketId, { text: reply, by: staffName || "Staff", role: staffRole || "staff" });
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      // The acting staff member just handled this ticket: it is seen for them.
      if (actorUid) {
        try { await markTicketsRead(String(actorUid), [String(ticket._id)]); } catch { /* ignore */ }
      }
      await emitTicketUpdated(ticket);
      return NextResponse.json({ success: true, ticket });
    }

    if (["open", "in_progress", "closed"].includes(action)) {
      const ticket = await updateTicketStatus(ticketId, action);
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      if (actorUid) {
        try { await markTicketsRead(String(actorUid), [String(ticket._id)]); } catch { /* ignore */ }
      }
      await emitTicketUpdated(ticket);
      return NextResponse.json({ success: true, ticket });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
