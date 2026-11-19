import { NextResponse } from "next/server";
import { createTicket, getTicketsByUid, addTicketReply, getTicketById, countAttentionTickets, clearTicketReads, markTicketsRead, attachTicketUnread, getTicketReadSet, sortTicketsUnreadFirst } from "@/lib/supportTicketModel";
import { createNotificationsForUids } from "@/lib/notificationModel";
import { getStaffUids } from "@/lib/userModel";
import { emitToChannel, emitToUser } from "@/lib/sseManager";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ success: false, message: "UID required" }, { status: 400 });
    const id = searchParams.get("id");
    // Single ticket for notification deep-links: the exact ticket opens
    // even when filters/pagination would hide it from the list.
    if (id) {
      const { ObjectId } = await import("mongodb");
      if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      const ticket = await getTicketById(id);
      if (!ticket || ticket.uid !== uid) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      const readSet = await getTicketReadSet(uid);
      const [withFlag] = attachTicketUnread([ticket], readSet);
      return NextResponse.json({ success: true, ticket: withFlag || ticket });
    }
    const tickets = await getTicketsByUid(uid);
    // Per-ticket read/unread for this customer (staff replies and stage
    // changes stay unread until the customer views them). Unread rows
    // sort first so they surface above newer read tickets.
    const readSet = await getTicketReadSet(uid);
    return NextResponse.json({ success: true, tickets: sortTicketsUnreadFirst(attachTicketUnread(tickets, readSet)) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Fan out a persistent notification log + live SSE to every staff member.
// Best-effort: must never break the ticket mutation itself.
async function notifyStaff({ type = "ticket_created", title, body, refId, event, ticket }) {
  try {
    const staffUids = await getStaffUids();
    if (staffUids.length === 0) return;
    const created = await createNotificationsForUids(staffUids, {
      role: "staff",
      type,
      title,
      body,
      link: "/admin/support-tickets",
      refType: "ticket",
      refId,
    });
    const byId = new Map(created.map((n) => [n.uid, n]));
    for (const uid of staffUids) {
      emitToUser(uid, "notify", { notification: byId.get(uid) || { title, body, refId } });
    }
    const pendingOpen = await countAttentionTickets();
    emitToChannel("admin:tickets", event, {
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
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email, customerName, subject, category, message, adAccountIds, adAccounts, attachments } = body;
    const resolvedSubject = (category || subject || "").trim();
    if (!uid || !email || !resolvedSubject || !message) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    // Validate ad account ownership server-side.
    let validatedAccounts = [];
    const ids = Array.isArray(adAccountIds) ? adAccountIds : (Array.isArray(adAccounts) ? adAccounts.map((a) => a?.accountId || a?._id || a?.id) : []);
    if (ids.filter(Boolean).length > 0) {
      const { getAdAccountsByUid } = await import("@/lib/adAccountModel");
      const userAccounts = await getAdAccountsByUid(uid);
      const byId = new Map(userAccounts.map((a) => [String(a._id), a]));
      const clientMeta = new Map((Array.isArray(adAccounts) ? adAccounts : []).map((a) => [String(a?.accountId || a?._id || a?.id), a]));
      validatedAccounts = ids.filter(Boolean).map((id) => {
        const acc = byId.get(String(id));
        if (!acc) return null;
        const meta = clientMeta.get(String(id)) || {};
        return {
          accountId: String(acc._id),
          metaAccountId: acc.metaAccountId || acc.accountId || meta.metaAccountId || null,
          name: acc.metaAccountName || acc.name || meta.name || null,
        };
      }).filter(Boolean);
      // Prevent duplicates
      const seen = new Set();
      validatedAccounts = validatedAccounts.filter((a) => {
        if (seen.has(a.accountId)) return false;
        seen.add(a.accountId);
        return true;
      });
    }

    // Validate attachments shape (metadata only, no file contents).
    const safeAttachments = Array.isArray(attachments) ? attachments.map((a) => ({
      id: String(a?.id || ""),
      name: String(a?.name || "").slice(0, 255),
      size: Number(a?.size || 0),
      type: String(a?.type || ""),
      uploadedAt: a?.uploadedAt || new Date().toISOString(),
    })).filter((a) => a.id) : [];

    const ticket = await createTicket({
      uid,
      email,
      customerName,
      subject: resolvedSubject,
      category: resolvedSubject,
      message: message.trim(),
      adAccounts: validatedAccounts,
      attachments: safeAttachments,
    });

    await notifyStaff({
      title: `New ticket ${ticket.ticketId}: ${ticket.subject}`,
      body: `${email} opened a support ticket.`,
      refId: String(ticket._id),
      event: "ticket.created",
      ticket,
    });
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

    // Customer replied: stage is now Customer Reply. Every staff member
    // must see this ticket as unread again, while the replying customer
    // has trivially seen their own reply.
    try {
      await clearTicketReads(ticketId);
      await markTicketsRead(uid, [String(result._id)]);
    } catch { /* read-state is best-effort */ }

    await notifyStaff({
      title: `Customer reply on ${result.ticketId}`,
      type: "ticket_reply",
      body: `${userName || "The customer"} replied: ${message.slice(0, 120)}`,
      refId: String(result._id),
      event: "ticket.updated",
      ticket: result,
    });

    return NextResponse.json({ success: true, ticket: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
