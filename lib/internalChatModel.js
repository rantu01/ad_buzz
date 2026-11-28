// Internal Admin/Staff chat data layer (System B).
// Performance notes (measured 2026-11-26): the production MongoDB has ~250 ms
// per round trip, so the hot paths are designed to minimise sequential queries.
//   - conversation membership is immutable, so it is cached per process;
//   - message insert + conversation preview + unread increment are one write;
//   - list/unread paths avoid aggregation and count queries;
//   - critical unique indexes are ensured with a small dedicated promise
//     instead of awaiting the full (35+) global index build on first chat use.
//
// No customer-chat collection is read or written here.

import clientPromise from "./mongodb";
import { STAFF_ROLES } from "./rbacCatalog";
import { getUserByUid } from "./userModel";
import { saveChatAttachment, getChatAttachment } from "./chatModel";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
const MEMBERSHIP_MAX = 2000;

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

// Only these indexes are required before a chat write. The complete index set
// is still created (once) by lib/indexes.js for the rest of the application.
let internalIndexesPromise = null;
function ensureInternalIndexes(db) {
  if (!internalIndexesPromise) {
    internalIndexesPromise = Promise.all([
      db.collection("internalConversations").createIndex({ key: 1 }, { unique: true }),
      db.collection("internalConversations").createIndex({ participants: 1, lastMessageAt: -1 }),
      db.collection("internalMessages").createIndex({ messageId: 1 }, { unique: true }),
      db.collection("internalMessages").createIndex({ clientId: 1 }, { unique: true, sparse: true }),
      db.collection("internalMessages").createIndex({ conversationId: 1, createdAt: -1 }),
      db.collection("internalCalls").createIndex({ callId: 1 }, { unique: true }),
      db.collection("internalCalls").createIndex({ conversationId: 1, createdAt: -1 }),
      db.collection("users").createIndex({ role: 1, displayName: 1, email: 1 }),
    ]).catch((err) => {
      internalIndexesPromise = null; // allow a later retry, never fail chat
      console.error("[internal-chat] index creation failed:", err.message);
    });
  }
  return internalIndexesPromise;
}

async function collection(name) {
  const db = await getDb();
  await ensureInternalIndexes(db);
  return db.collection(name);
}

const getConversations = () => collection("internalConversations");
const getMessagesCol = () => collection("internalMessages");
const getCallsCol = () => collection("internalCalls");

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join("::");
}

function snapshot(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email || "User",
    email: user.email || "",
    role: user.role || "customer",
    avatar: user.avatar || null,
  };
}

function unreadOf(conv, uid) {
  // Defensive: older or malformed documents may not carry an unread array.
  if (!Array.isArray(conv?.unread)) return 0;
  return conv.unread.find((entry) => entry?.uid === uid)?.count || 0;
}

function previewFor(message) {
  const type = message.messageType || "text";
  if (type === "text") return String(message.content || "").slice(0, 140);
  if (type === "voice") return "Voice message";
  if (type === "image") return "Photo";
  if (type === "file") return "Attachment";
  if (type === "call_event") return String(message.content || "Call");
  return "Message";
}

// ---------- Users / directory ----------

export async function listInternalEligibleUsers({ excludeUid, search, limit = 100 } = {}) {
  const db = await getDb();
  await ensureInternalIndexes(db);
  const filter = { role: { $in: STAFF_ROLES } };
  if (excludeUid) filter.uid = { $ne: excludeUid };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ displayName: rx }, { email: rx }, { role: rx }];
  }
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 100)), 200);
  return db
    .collection("users")
    .find(filter)
    .project({ uid: 1, displayName: 1, email: 1, role: 1, avatar: 1 })
    .sort({ displayName: 1, email: 1 })
    .limit(safeLimit)
    .toArray();
}

export async function getInternalUser(uid) {
  return getUserByUid(uid);
}

// Batch lookup: one round trip instead of two for conversation snapshots.
async function getUsersByUids(uids) {
  const db = await getDb();
  return db.collection("users").find({ uid: { $in: uids } }).project({ uid: 1, displayName: 1, email: 1, role: 1, avatar: 1 }).toArray();
}

// ---------- Conversations ----------

export async function getOrCreateInternalConversation(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) throw new Error("Two distinct participants are required");
  const col = await getConversations();
  const key = pairKey(uidA, uidB);

  // Fast path: one indexed lookup when the conversation already exists.
  const existing = await col.findOne({ key });
  if (existing) return existing;

  const [firstUid, secondUid] = key.split("::");
  const users = await getUsersByUids([firstUid, secondUid]);
  if (users.length < 2) throw new Error("Participant not found");
  const byUid = new Map(users.map((u) => [u.uid, u]));

  const now = new Date();
  const doc = {
    conversationId: newId("ic"),
    key,
    participants: [firstUid, secondUid],
    people: [byUid.get(firstUid), byUid.get(secondUid)].map(snapshot),
    unread: [{ uid: firstUid, count: 0 }, { uid: secondUid, count: 0 }],
    lastMessage: "",
    lastMessageAt: now,
    lastMessageSenderId: null,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic upsert: the unique `key` index makes simultaneous creation by both
  // participants converge on exactly one document.
  const res = await col.findOneAndUpdate(
    { key },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: "after" }
  );
  if (res.value) return res.value;
  return col.findOne({ key });
}

export async function getInternalConversation(conversationId) {
  if (!conversationId) return null;
  return (await getConversations()).findOne({ conversationId });
}

// Membership never changes for an internal conversation, so a bounded,
// short-TTL cache safely removes a round trip from every read/write.
const membershipCache = new Map();
function cacheMembership(conv) {
  if (!conv) return;
  for (const uid of conv.participants || []) {
    const key = `${uid}|${conv.conversationId}`;
    membershipCache.delete(key);
    membershipCache.set(key, { conv, at: Date.now() });
  }
  while (membershipCache.size > MEMBERSHIP_MAX) {
    membershipCache.delete(membershipCache.keys().next().value);
  }
}

export async function getConversationForParticipant(conversationId, uid) {
  if (!conversationId || !uid) return null;
  const key = `${uid}|${conversationId}`;
  const cached = membershipCache.get(key);
  if (cached && Date.now() - cached.at < MEMBERSHIP_TTL_MS) return cached.conv;
  const conv = await (await getConversations()).findOne({ conversationId, participants: uid });
  if (conv) cacheMembership(conv);
  else membershipCache.delete(key);
  return conv;
}

export async function listInternalConversations(uid, { search, page = 1, limit = 30 } = {}) {
  const col = await getConversations();
  const filter = { participants: uid };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ "people.displayName": rx }, { "people.email": rx }, { lastMessage: rx }];
  }
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100);
  // No countDocuments round trip: the UI only needs the current page.
  const items = await col
    .find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit)
    .toArray();
  for (const conv of items) cacheMembership(conv);
  return { items, page: safePage, limit: safeLimit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / safeLimit)) };
}

export async function getTotalInternalUnread(uid) {
  // Simple projection + reduce: one indexed query, no $unwind/$group pipeline.
  const docs = await (await getConversations())
    .find({ participants: uid })
    .project({ unread: 1 })
    .toArray();
  return docs.reduce((sum, conv) => sum + unreadOf(conv, uid), 0);
}

async function bumpUnread(conversationId, receiverUid) {
  const col = await getConversations();
  const positional = await col.updateOne(
    { conversationId, "unread.uid": receiverUid },
    { $inc: { "unread.$.count": 1 } }
  );
  if (!positional.matchedCount) {
    await col.updateOne(
      { conversationId },
      { $addToSet: { unread: { uid: receiverUid, count: 1 } } }
    );
  }
}

export async function markInternalRead(conversationId, uid) {
  const convCol = await getConversations();
  await convCol.updateOne(
    { conversationId, "unread.uid": uid },
    { $set: { "unread.$.count": 0, updatedAt: new Date() } }
  );
  const msgCol = await getMessagesCol();
  await msgCol.updateMany(
    { conversationId, readBy: { $ne: uid } },
    { $addToSet: { readBy: uid } }
  );
  return true;
}

export function internalUnreadCount(conv, uid) {
  return unreadOf(conv, uid);
}

// ---------- Messages ----------

const MESSAGE_PROJECTION = {
  _id: 0, messageId: 1, conversationId: 1, senderId: 1, receiverId: 1,
  senderNameSnapshot: 1, senderRole: 1, senderAvatar: 1, messageType: 1,
  content: 1, attachments: 1, voiceMetadata: 1, callMetadata: 1,
  readBy: 1, createdAt: 1, clientId: 1,
};

export async function createInternalMessage({
  conversationId,
  senderId,
  receiverId,
  senderSnapshot,
  messageType = "text",
  content = "",
  attachments = [],
  voiceMetadata = null,
  callMetadata = null,
  clientId = null,
}) {
  const col = await getMessagesCol();
  const now = new Date();
  const doc = {
    messageId: newId("im"),
    conversationId,
    senderId,
    receiverId: receiverId || null,
    senderNameSnapshot: senderSnapshot?.displayName || "",
    senderRole: senderSnapshot?.role || null,
    senderAvatar: senderSnapshot?.avatar || null,
    messageType,
    content: content || "",
    attachments,
    voiceMetadata: voiceMetadata || null,
    callMetadata: callMetadata || null,
    readBy: [senderId],
    ...(clientId ? { clientId: String(clientId).slice(0, 80) } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await col.insertOne(doc);
  } catch (error) {
    // Idempotent retry: a client re-sending the same clientId gets the
    // original message instead of a duplicate.
    if (error?.code === 11000 && clientId) {
      const existing = await col.findOne({ conversationId, clientId }, { projection: MESSAGE_PROJECTION });
      return { message: existing, conversation: null, duplicate: true };
    }
    throw error;
  }

  // One write updates the preview AND unread counter; the returned document
  // is reused for the SSE payload (no follow-up read).
  const convCol = await getConversations();
  const update = {
    $set: {
      lastMessage: previewFor(doc),
      lastMessageAt: now,
      lastMessageSenderId: senderId,
      updatedAt: now,
    },
  };
  const result = await convCol.findOneAndUpdate(
    { conversationId, "unread.uid": receiverId },
    { ...update, $inc: { "unread.$.count": 1 } },
    { returnDocument: "after" }
  );
  let conversation = result.value;
  if (!conversation) {
    await convCol.updateOne({ conversationId }, update);
    if (receiverId && receiverId !== senderId) await bumpUnread(conversationId, receiverId);
  } else {
    cacheMembership(conversation);
  }
  const { _id, updatedAt, ...message } = doc;
  return { message, conversation, duplicate: false };
}

// Cursor page with an extra element for `hasMore` (no count query). The
// response metadata is additive so existing clients reading `messages` are
// unaffected. `before` is the ISO createdAt of the oldest loaded message, or a
// legacy messageId.
export async function getInternalMessagesPage(conversationId, { before, limit = 50 } = {}) {
  const col = await getMessagesCol();
  const filter = { conversationId };
  if (before) {
    const date = /^\d{4}-\d{2}-\d{2}T/.test(String(before)) ? new Date(before) : null;
    if (date && !Number.isNaN(date.getTime())) {
      filter.createdAt = { $lt: date };
    } else {
      const pivot = await col.findOne({ messageId: before }, { projection: { createdAt: 1 } });
      if (pivot) filter.createdAt = { $lt: pivot.createdAt };
    }
  }
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 100);
  const found = await col.find(filter).project(MESSAGE_PROJECTION).sort({ createdAt: -1 }).limit(safeLimit + 1).toArray();
  const hasMore = found.length > safeLimit;
  const page = hasMore ? found.slice(0, safeLimit) : found;
  page.reverse();
  const oldest = page[0]?.createdAt;
  return {
    messages: page,
    hasMore,
    nextCursor: oldest ? new Date(oldest).toISOString() : null,
  };
}

export async function getInternalMessages(conversationId, options = {}) {
  const { messages } = await getInternalMessagesPage(conversationId, options);
  return messages;
}

// ---------- Calls ----------

export async function createInternalCall({ conversationId, initiatorId, receiverId, callType }) {
  const col = await getCallsCol();
  const now = new Date();
  const doc = {
    callId: newId("icall"),
    conversationId,
    initiatorId,
    receiverId,
    callType: callType === "video" ? "video" : "voice",
    status: "ringing",
    startedAt: now,
    answeredAt: null,
    endedAt: null,
    duration: 0,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return doc;
}

export async function getInternalCall(callId) {
  const col = await getCallsCol();
  return col.findOne({ callId });
}

export async function updateInternalCall(callId, updates) {
  const col = await getCallsCol();
  await col.updateOne({ callId }, { $set: { ...updates, updatedAt: new Date() } });
  return col.findOne({ callId });
}

export async function listInternalCalls(conversationId, limit = 50) {
  const col = await getCallsCol();
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 100);
  return col.find({ conversationId }).project({ _id: 0 }).sort({ createdAt: -1 }).limit(safeLimit).toArray();
}

export function isTerminalCallStatus(status) {
  return ["ended", "rejected", "missed"].includes(status);
}

// ---------- Attachments (shared binary store, internal authorization) ----------

export async function saveInternalAttachment({ uid, name, size, type, data }) {
  return saveChatAttachment({ uid, name, size, type, data });
}

export async function getInternalAttachment(id) {
  return getChatAttachment(id);
}

export async function findInternalMessageByAttachment(attachmentId) {
  return (await getMessagesCol()).findOne({ "attachments.id": attachmentId });
}

// ---------- Presence helpers ----------

export function personOf(conv, uid) {
  return Array.isArray(conv?.people) ? conv.people.find((p) => p?.uid === uid) : null;
}

export function peerOf(conv, uid) {
  const people = Array.isArray(conv?.people) ? conv.people : [];
  const participants = Array.isArray(conv?.participants) ? conv.participants : [];
  const peer = people.find((p) => p?.uid !== uid);
  if (peer) return peer;
  const otherUid = participants.find((p) => p && p !== uid) || null;
  return otherUid
    ? { uid: otherUid, displayName: "User", email: "", role: "customer", avatar: null }
    : null;
}
