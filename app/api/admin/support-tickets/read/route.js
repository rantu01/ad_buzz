import { NextResponse } from "next/server";
import {
  markTicketsRead,
  markAllTicketsRead,
  getUnreadTicketState,
  getUnreadCountsByStage,
  getTicketStageTotals,
} from "@/lib/supportTicketModel";

// Mark tickets as seen for one staff member.
//   POST { uid, ticketIds: [...] } -> marks those tickets read
//   POST { uid, all: true }        -> marks all unresolved tickets read
// Responds with the fresh badge state so the UI reconciles immediately
// without a second round-trip.
export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, ticketIds, all } = body;
    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }
    if (all) {
      await markAllTicketsRead(uid);
    } else if (Array.isArray(ticketIds) && ticketIds.length > 0) {
      await markTicketsRead(uid, ticketIds);
    }
    const state = await getUnreadTicketState(uid);
    const counts = await getUnreadCountsByStage(uid);
    const totals = await getTicketStageTotals();
    return NextResponse.json({ success: true, ...state, byStage: counts.byStage || {}, totalUnread: counts.total ?? state.unread ?? 0, stageTotals: totals.byStage || {}, totalTickets: totals.total || 0 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
