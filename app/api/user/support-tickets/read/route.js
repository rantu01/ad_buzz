import { NextResponse } from "next/server";
import {
  getTicketsByUid,
  getTicketReadSet,
  isTicketUnreadFor,
  markTicketsRead,
} from "@/lib/supportTicketModel";

// Per-customer ticket read state.
//   POST { uid, ticketIds: [...] } -> marks those tickets read for the customer
//   POST { uid, all: true }        -> marks all of the customer's open tickets read
// Responds with the fresh unread count for the customer's ticket list.
export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, ticketIds, all } = body;
    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }
    if (all) {
      const tickets = await getTicketsByUid(uid);
      await markTicketsRead(uid, tickets.map((t) => String(t._id)));
    } else if (Array.isArray(ticketIds) && ticketIds.length > 0) {
      await markTicketsRead(uid, ticketIds);
    }
    const tickets = await getTicketsByUid(uid);
    const readSet = await getTicketReadSet(uid);
    const unread = tickets.filter((t) => isTicketUnreadFor(t, readSet)).length;
    return NextResponse.json({ success: true, unread });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
