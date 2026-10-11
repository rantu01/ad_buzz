import { NextResponse } from "next/server";
import { countAttentionTickets, getUnreadTicketState, getUnreadCountsByStage, getTicketStageTotals } from "@/lib/supportTicketModel";

// Single source of truth for the notification badge + tab counts.
//   GET ?uid=<staffUid> -> { pendingOpen, unread, items, byStage, totalUnread, stageTotals, totalTickets }
// - `unread`: unresolved tickets this admin has not seen (drives the badge
//   and the "Unread Messages" tab; 0 when everything is read, closed
//   tickets never included).
// - `pendingOpen`: all unresolved tickets (info only).
// - `items`: up to 20 most recent unread tickets for the dropdown.
// - `byStage`: unread counts per ticket stage.
// - `stageTotals`: TOTAL tickets per stage (read + unread) — drives the
//   status tab badges so they match the rows each tab displays.
// Without `uid` it falls back to totals only (legacy contract).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid") || null;
    const totals = await getTicketStageTotals();
    if (!uid) {
      const pendingOpen = await countAttentionTickets();
      return NextResponse.json({ success: true, pendingOpen, unread: pendingOpen, items: [], stageTotals: totals.byStage || {}, totalTickets: totals.total || 0 });
    }
    const state = await getUnreadTicketState(uid);
    const counts = await getUnreadCountsByStage(uid);
    return NextResponse.json({ success: true, ...state, byStage: counts.byStage || {}, totalUnread: counts.total ?? state.unread ?? 0, stageTotals: totals.byStage || {}, totalTickets: totals.total || 0 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
