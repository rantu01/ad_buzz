import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAllTickets, getTicketById, updateTicketStatus, addTicketReply, countAttentionTickets, markTicketsRead, clearTicketReadsForUid, attachTicketUnread, getTicketReadSet } from "@/lib/supportTicketModel";
import { createNotificationsForUids, createNotification } from "@/lib/notificationModel";
import { getStaffUids } from "@/lib/userModel";
import { emitToChannel, emitToUser } from "@/lib/sseManager";
import { WRITABLE_TICKET_STATUSES, ticketStageLabel } from "@/lib/ticketStages";

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

// Notify the ticket owner (customer) with a persistent log + live SSE,
// and fan the same event out to all OTHER staff members.
async function notifyTicketEvent({ ticket, type, title, body, actorUid }) {
  try {
    if (ticket?.uid) {
      const customerNotif = await createNotification({
        uid: ticket.uid,
        role: "customer",
        type,
        title,
        body,
        link: "/user-dashboard/support-tickets",
        refType: "ticket",
        refId: String(ticket._id),
      });
      emitToUser(ticket.uid, "notify", { notification: customerNotif || { title, body } });
      // Staff activity must leave the ticket unread for the customer
      // until they view it.
      await clearTicketReadsForUid(ticket._id, ticket.uid);
    }
    const staffUids = await getStaffUids(actorUid ? [actorUid] : []);
    if (staffUids.length > 0) {
      const created = await createNotificationsForUids(staffUids, {
        role: "staff",
        type,
        title,
        body,
        link: "/admin/support-tickets",
        refType: "ticket",
        refId: String(ticket._id),
      });
      const byId = new Map(created.map((n) => [n.uid, n]));
      for (const uid of staffUids) {
        emitToUser(uid, "notify", { notification: byId.get(uid) || { title, body } });
      }
    }
  } catch { /* notification is best-effort */ }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const ticketId = searchParams.get("ticketId");
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");
    const id = searchParams.get("id");
    const uid = searchParams.get("uid");
    // Single full ticket for the detail pane (replies included).
    if (id) {
      if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      const ticket = await getTicketById(id);
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ success: true, ticket });
    }
    const result = await getAllTickets(status || null, ticketId || null, { page, limit });
    // Attach per-admin read/unread flags when the viewer is known, so
    // unread tickets render distinctly without extra round-trips.
    const withUnread = async (tickets) => {
      if (!uid || !Array.isArray(tickets)) return tickets;
      const readSet = await getTicketReadSet(uid);
      return attachTicketUnread(tickets, readSet);
    };
    // Paged shape when ?page=&limit= are given; legacy array otherwise.
    if (result && Array.isArray(result.tickets)) {
      return NextResponse.json({ success: true, ...result, tickets: await withUnread(result.tickets) });
    }
    return NextResponse.json({ success: true, tickets: await withUnread(result) });
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
      // Stage is now Support Agent Reply: notify the customer and the rest
      // of the staff, and refresh every connected staff list.
      await notifyTicketEvent({
        ticket,
        type: "ticket_reply",
        title: `Support reply on ${ticket.ticketId}`,
        body: `${staffName || "Support"} replied: ${reply.slice(0, 120)}`,
        actorUid,
      });
      await emitTicketUpdated(ticket);
      return NextResponse.json({ success: true, ticket });
    }

    if (WRITABLE_TICKET_STATUSES.includes(action)) {
      const ticket = await updateTicketStatus(ticketId, action);
      if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      if (actorUid) {
        try { await markTicketsRead(String(actorUid), [String(ticket._id)]); } catch { /* ignore */ }
      }
      // Every stage change notifies both the customer and other staff.
      await notifyTicketEvent({
        ticket,
        type: "ticket_stage",
        title: `Ticket ${ticket.ticketId} moved to ${ticketStageLabel(ticket.status)}`,
        body: `${staffName || "Support"} updated the stage to ${ticketStageLabel(ticket.status)}.`,
        actorUid,
      });
      await emitTicketUpdated(ticket);
      return NextResponse.json({ success: true, ticket });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
