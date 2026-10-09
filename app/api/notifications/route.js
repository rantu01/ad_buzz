import { NextResponse } from "next/server";
import { getNotificationsByUid } from "@/lib/notificationModel";

// Persistent notification log for one user (customer, staff, or admin).
//   GET ?uid=<uid>&page=&limit=&unreadOnly=1 -> { notifications, total, unread, ... }
// - `notifications`: newest-first log rows (each with its own read flag).
// - `total`: rows matching the filter (drives pagination).
// - `unread`: count of ALL unread rows (drives badges; client never derives it).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ success: false, message: "UID required" }, { status: 400 });
    }
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");
    const unreadOnly = searchParams.get("unreadOnly") === "1" || searchParams.get("unreadOnly") === "true";
    const result = await getNotificationsByUid(uid, { page, limit, unreadOnly });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
