// Notice delivery side-effects: persistent notification-log rows for bounded
// (individually targeted) audiences, live SSE pushes, and lazy promotion of
// scheduled notices. All delivery is best-effort — it never fails the notice
// mutation that triggered it.

import { createNotificationsForUids } from "./notificationModel";
import { emitToAll, emitToChannel, emitToUser } from "./sseManager";
import { getDueScheduledNoticeIds, promoteScheduledNotice } from "./noticeModel";

const CUSTOMER_LINK = "/user-dashboard/notices";

function shortBody(message = "") {
  return String(message || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function livePayload(notice) {
  return {
    noticeId: String(notice._id),
    title: notice.title,
    type: notice.type,
    priority: notice.priority,
    requireAcknowledgement: Boolean(notice.requireAcknowledgement),
  };
}

// Called after a notice becomes published. Targeted notices are small and
// bounded, so they get one persistent notification row per recipient. Global
// notices avoid N inserts: online customers get an SSE push and everyone else
// reconciles from the authoritative /api/notices/counts endpoint on login.
export async function notifyNoticePublished(notice, targetUids = []) {
  try {
    const payload = livePayload(notice);
    if (notice.audienceType === "individual") {
      const uids = Array.from(new Set((targetUids || []).map(String).filter(Boolean)));
      if (uids.length > 0) {
        const created = await createNotificationsForUids(uids, {
          role: "customer",
          type: "notice",
          title: notice.title,
          body: shortBody(notice.message),
          link: CUSTOMER_LINK,
          refType: "notice",
          refId: String(notice._id),
        });
        const byUid = new Map(created.map((n) => [String(n.uid), n]));
        for (const uid of uids) {
          emitToUser(uid, "notice:published", payload);
          emitToUser(uid, "notify", {
            notification: byUid.get(uid) || {
              title: notice.title,
              body: shortBody(notice.message),
              link: CUSTOMER_LINK,
              refType: "notice",
              refId: String(notice._id),
            },
          });
        }
      }
    } else {
      emitToAll("notice:published", payload);
    }
    emitToChannel("admin:notices", "notice.updated", payload);
  } catch {
    // Delivery must never roll back publishing.
  }
}

export async function notifyNoticeUpdated(notice, event = "notice.updated") {
  try {
    const payload = livePayload(notice);
    emitToChannel("admin:notices", event, payload);
    if (notice.audienceType === "individual") {
      for (const uid of notice.targetCustomerIds || []) {
        emitToUser(String(uid), "notice:updated", payload);
      }
    } else {
      emitToAll("notice:updated", payload);
    }
  } catch {
    // best-effort
  }
}

// Promote any scheduled notice whose publish time has arrived. Called from
// customer read endpoints, so scheduling works without an external cron.
export async function publishDueScheduledNotices() {
  try {
    const ids = await getDueScheduledNoticeIds();
    for (const id of ids) {
      const promoted = await promoteScheduledNotice(id);
      if (promoted) await notifyNoticePublished(promoted, promoted.targetCustomerIds || []);
    }
    return ids.length;
  } catch {
    return 0;
  }
}
