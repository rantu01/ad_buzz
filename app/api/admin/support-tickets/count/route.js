import { NextResponse } from "next/server";
import { countAttentionTickets, getUnreadTicketState } from "@/lib/supportTicketModel";

// Single source of truth for the notification badge.
//   GET ?uid=<staffUid> -> { pendingOpen, unread, items }
// - `unread`: unresolved tickets this admin has not seen (drives the badge;
//   0 when everything is read, closed tickets never included).
// - `pendingOpen`: all unresolved tickets (info only).
// - `items`: up to 20 most recent unread tickets for the dropdown.
// Without `uid` it falls back to totals only (legacy contract).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid") || null;
    if (!uid) {
      const pendingOpen = await countAttentionTickets();
      return NextResponse.json({ success: true, pendingOpen, unread: pendingOpen, items: [] });
    }
    const state = await getUnreadTicketState(uid);
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
