import { NextResponse } from "next/server";
import { getAllTickets, getTicketById, updateTicketStatus, addTicketReply } from "@/lib/supportTicketModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const ticketId = searchParams.get("ticketId");
    const tickets = await getAllTickets(status || null, ticketId || null);
    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { ticketId, action, reply, staffName, staffRole } = body;

    if (!ticketId || !action) {
      return NextResponse.json({ success: false, message: "ticketId and action required" }, { status: 400 });
    }

    if (action === "reply") {
      if (!reply) {
        return NextResponse.json({ success: false, message: "reply text required" }, { status: 400 });
      }
      const ticket = await addTicketReply(ticketId, { text: reply, by: staffName || "Staff", role: staffRole || "staff" });
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ success: true, ticket });
    }

    if (["open", "in_progress", "closed"].includes(action)) {
      const ticket = await updateTicketStatus(ticketId, action);
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ success: true, ticket });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
