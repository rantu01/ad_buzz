import clientPromise from "./mongodb";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

// Persistent notification log. Every ticket reply/stage change and every
// deposit stage (pending/approved/rejected) writes one document PER
// recipient, so each user has an independent read/unread state and a full
// history that survives refreshes and SSE reconnects.
//
// Document shape:
// {
//   uid,            // recipient Firebase uid (string)
//   role,           // "customer" | "staff" (recipient side, for filtering)
//   type,           // ticket_created | ticket_reply | ticket_stage |
//                  // deposit_pending | deposit_approved | deposit_rejected
//   title, body,    // human-readable content
//   link,           // in-app destination, e.g. "/admin/support-tickets"
//   refType,        // "ticket" | "deposit" | null
//   refId,          // referenced _id / ticketId (string) or null
//   read,           // boolean, per-recipient
//   readAt, createdAt
// }

async function getCollection() {
  await initializeIndexes();
  const client = await clientPromise;
  return client.db(DB_NAME).collection("notifications");
}

export async function createNotification({
  uid,
  role = "customer",
  type,
  title,
  body = "",
  link = null,
  refType = null,
  refId = null,
}) {
  if (!uid || !type || !title) return null;
  const collection = await getCollection();
  const doc = {
    uid: String(uid),
    role,
    type,
    title,
    body: body || "",
    link: link || null,
    refType: refType || null,
    refId: refId ? String(refId) : null,
    read: false,
    readAt: null,
    createdAt: new Date(),
  };
  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// Fan-out helper: one log row per recipient. Never throws (notification
// delivery must never break the ticket/deposit mutation itself).
export async function createNotificationsForUids(uids, payload) {
  try {
    const targets = Array.from(new Set((uids || []).filter(Boolean).map(String)));
    if (targets.length === 0 || !payload?.type || !payload?.title) return [];
    const collection = await getCollection();
    const now = new Date();
    const docs = targets.map((uid) => ({
      uid,
      role: payload.role || "customer",
      type: payload.type,
      title: payload.title,
      body: payload.body || "",
      link: payload.link || null,
      refType: payload.refType || null,
      refId: payload.refId ? String(payload.refId) : null,
      read: false,
      readAt: null,
      createdAt: now,
    }));
    const result = await collection.insertMany(docs, { ordered: false });
    return docs.map((doc, i) => ({ ...doc, _id: result.insertedIds[i] }));
  } catch {
    return [];
  }
}

export async function getNotificationsByUid(uid, { page, limit, unreadOnly = false } = {}) {
  const collection = await getCollection();
  const filter = { uid: String(uid) };
  if (unreadOnly) filter.read = { $ne: true };
  const usePaging = Number.isFinite(Number(page)) && Number.isFinite(Number(limit)) && Number(limit) > 0;
  const safePage = usePaging ? Math.max(1, Math.floor(Number(page))) : 1;
  const safeLimit = usePaging ? Math.min(Math.floor(Number(limit)), 100) : 0;

  const [total, unread, notifications] = await Promise.all([
    collection.countDocuments(filter),
    collection.countDocuments({ uid: String(uid), read: { $ne: true } }),
    collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(usePaging ? (safePage - 1) * safeLimit : 0)
      .limit(safeLimit || 50)
      .toArray(),
  ]);

  if (!usePaging) return { notifications, total, unread };
  return {
    notifications,
    total,
    unread,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function countUnreadNotifications(uid) {
  if (!uid) return 0;
  const collection = await getCollection();
  return collection.countDocuments({ uid: String(uid), read: { $ne: true } });
}

export async function markNotificationsRead(uid, ids) {
  if (!uid || !Array.isArray(ids) || ids.length === 0) return 0;
  const collection = await getCollection();
  const { ObjectId } = await import("mongodb");
  const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return 0;
  const result = await collection.updateMany(
    { uid: String(uid), _id: { $in: objectIds }, read: { $ne: true } },
    { $set: { read: true, readAt: new Date() } }
  );
  return result.modifiedCount || 0;
}

export async function markAllNotificationsRead(uid) {
  if (!uid) return 0;
  const collection = await getCollection();
  const result = await collection.updateMany(
    { uid: String(uid), read: { $ne: true } },
    { $set: { read: true, readAt: new Date() } }
  );
  return result.modifiedCount || 0;
}

// Mark every unread log row that references one ticket/deposit as read.
// Used when the user views that ticket/deposit: the bell must reflect
// what was seen immediately, without waiting for a refresh.
export async function markNotificationsReadByRef(uid, refType, refId) {
  if (!uid || !refType || !refId) return 0;
  const collection = await getCollection();
  const result = await collection.updateMany(
    { uid: String(uid), refType, refId: String(refId), read: { $ne: true } },
    { $set: { read: true, readAt: new Date() } }
  );
  return result.modifiedCount || 0;
}

// Mark every unread log row of the given types as read (e.g. all ticket
// logs when "mark all read" is pressed on the tickets page).
export async function markNotificationsReadByTypes(uid, types) {
  if (!uid || !Array.isArray(types) || types.length === 0) return 0;
  const collection = await getCollection();
  const result = await collection.updateMany(
    { uid: String(uid), type: { $in: types }, read: { $ne: true } },
    { $set: { read: true, readAt: new Date() } }
  );
  return result.modifiedCount || 0;
}
