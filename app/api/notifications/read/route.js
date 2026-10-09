import { NextResponse } from "next/server";
import {
  markNotificationsRead,
  markAllNotificationsRead,
  markNotificationsReadByRef,
  markNotificationsReadByTypes,
  countUnreadNotifications,
} from "@/lib/notificationModel";

// Mark notification logs as read for one user.
//   POST { uid, ids: [...] }               -> marks those rows read
//   POST { uid, all: true }                -> marks every unread row read
//   POST { uid, refType, refId }           -> marks rows for one ticket/deposit read
//   POST { uid, types: [...] }             -> marks rows of those types read
// Responds with the fresh unread count so badges reconcile immediately.
export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, ids, all, refType, refId, types } = body;
    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }
    if (all) {
      await markAllNotificationsRead(uid);
    } else if (refType && refId) {
      await markNotificationsReadByRef(uid, refType, refId);
    } else if (Array.isArray(types) && types.length > 0) {
      await markNotificationsReadByTypes(uid, types);
    } else if (Array.isArray(ids) && ids.length > 0) {
      await markNotificationsRead(uid, ids);
    }
    const unread = await countUnreadNotifications(uid);
    return NextResponse.json({ success: true, unread });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
