import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";
import { initializeIndexes } from "./indexes";
import { STAFF_ROLES } from "./rbacCatalog";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

async function getConversations() {
  await initializeIndexes();
  const db = await getDb();
  return db.collection("chatConversations");
}

async function getMessagesCol() {
  await initializeIndexes();
  const db = await getDb();
  return db.collection("chatMessages");
}

async function getCallsCol() {
  await initializeIndexes();
  const db = await getDb();
  return db.collection("chatCalls");
}

async function getAttachmentsCol() {
  await initializeIndexes();
  const db = await getDb();
  return db.collection("chatAttachments");
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateConversation({ customerId, customerName, customerEmail }) {
  const col = await getConversations();
  let conv = await col.findOne({ customerId });
  if (conv) {
    await col.updateOne({ _id: conv._id }, { $set: { customerName: customerName || conv.customerName, customerEmail: customerEmail || conv.customerEmail, updatedAt: new Date() } });
    conv = await col.findOne({ customerId });
    return conv;
  }
  const now = new Date();
  const doc = {
    conversationId: newId("conv"),
    customerId,
    customerName: customerName || "",
    customerEmail: customerEmail || "",
    assignedStaffId: null,
    assignedStaffName: null,
    assignedTeam: null,
    status: "open",
    lastMessage: "",
    lastMessageAt: now,
    lastMessageSenderId: null,
    unreadForCustomer: 0,
    unreadForStaff: 0,
    createdAt: now,
    updatedAt: now,
  };
  const res = await col.insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function getConversationById(conversationId) {
  const col = await getConversations();
  return col.findOne({ conversationId });
}

export async function getConversationByCustomer(customerId) {
  const col = await getConversations();
  return col.findOne({ customerId });
}

export async function listConversations({ status, search, page = 1, limit = 30, assignedStaffId } = {}) {
  const col = await getConversations();
  const filter = {};
  if (status && status !== "all") {
    if (status === "unread") filter.unreadForStaff = { $gt: 0 };
    else if (status === "open") filter.status = "open";
    else if (status === "closed") filter.status = "closed";
  }
  if (assignedStaffId) filter.assignedStaffId = assignedStaffId;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { customerName: rx },
      { customerEmail: rx },
      { lastMessage: rx },
      { conversationId: rx },
    ];
  }
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100);
  const [total, items] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).toArray(),
  ]);
  return { items, total, page: safePage, limit: safeLimit, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}

export async function updateConversation(conversationId, updates) {
  const col = await getConversations();
  await col.updateOne({ conversationId }, { $set: { ...updates, updatedAt: new Date() } });
  return col.findOne({ conversationId });
}

export async function assignConversation(conversationId, staffUid, staffName) {
  return updateConversation(conversationId, { assignedStaffId: staffUid || null, assignedStaffName: staffName || null });
}

export async function setConversationStatus(conversationId, status) {
  return updateConversation(conversationId, { status });
}

export async function createMessage({
  conversationId,
  senderId,
  senderType,
  senderRole,
  senderNameSnapshot,
  senderAvatar,
  messageType = "text",
  content = "",
  attachments = [],
  voiceMetadata = null,
  callMetadata = null,
  clientId = null,
}) {
  const col = await getMessagesCol();
  const now = new Date();
  const messageId = newId("msg");
  const doc = {
    ...(clientId ? { clientId: String(clientId).slice(0, 80) } : {}),
    messageId,
    conversationId,
    senderId,
    senderType,
    senderRole: senderRole || null,
    senderNameSnapshot: senderNameSnapshot || "",
    senderAvatar: senderAvatar || null,
    messageType,
    content: content || "",
    attachments: Array.isArray(attachments) ? attachments : [],
    voiceMetadata,
    callMetadata,
    readBy: [senderId],
    createdAt: now,
    updatedAt: now,
  };
  try {
    await col.insertOne(doc);
  } catch (error) {
    // Idempotent optimistic send: same clientId returns the original message.
    if (error?.code === 11000 && clientId) {
      const existing = await col.findOne({ conversationId, clientId });
      return Object.defineProperty({ ...existing, _duplicate: true }, "_conversation", { value: null, enumerable: false });
    }
    throw error;
  }

  const convCol = await getConversations();
  const preview = messageType === "text" ? (content || "").slice(0, 120) :
    messageType === "voice" ? "Voice message" :
    messageType === "image" ? "Photo" :
    messageType === "file" ? "Attachment" :
    messageType === "call_event" ? (callMetadata?.status || "Call") :
    messageType === "system_event" ? (content || "System") : "Message";
  const inc = senderType === "customer"
    ? { unreadForStaff: 1 }
    : senderType === "staff"
    ? { unreadForCustomer: 1 }
    : {};
  const updated = await convCol.findOneAndUpdate(
    { conversationId },
    {
      $set: { lastMessage: preview, lastMessageAt: now, lastMessageSenderId: senderId, updatedAt: now },
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
    },
    { returnDocument: "after" }
  );

  // Non-enumerable: routes can reuse the updated conversation for the SSE
  // payload without another database round trip, but it is not serialized.
  Object.defineProperty(doc, "_conversation", { value: updated?.value || null, enumerable: false });
  return doc;
}

// Fetch a bounded, most-recent page plus one extra element so `hasMore` can be
// derived without an expensive count. `before` accepts an ISO createdAt cursor
// (no pivot read) or a legacy messageId. Existing callers of getMessages() keep
// receiving a plain array; new callers can use the metadata-rich page result.
export async function getMessagesPage(conversationId, { before, limit = 40 } = {}) {
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
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 40)), 100);
  const found = await col.find(filter).sort({ createdAt: -1 }).limit(safeLimit + 1).toArray();
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

export async function getMessages(conversationId, options = {}) {
  const { messages } = await getMessagesPage(conversationId, options);
  return messages;
}

export async function markRead(conversationId, readerUid, readerType) {
  const convCol = await getConversations();
  const msgCol = await getMessagesCol();
  const now = new Date();
  if (readerType === "customer") {
    await convCol.updateOne({ conversationId }, { $set: { unreadForCustomer: 0, updatedAt: now } });
  } else {
    await convCol.updateOne({ conversationId }, { $set: { unreadForStaff: 0, updatedAt: now } });
  }
  await msgCol.updateMany(
    { conversationId, readBy: { $ne: readerUid } },
    { $addToSet: { readBy: readerUid } }
  );
  return true;
}

export async function getTotalUnreadForCustomer(customerId) {
  const conv = await getConversationByCustomer(customerId);
  return conv ? conv.unreadForCustomer || 0 : 0;
}

export async function getTotalUnreadForStaff() {
  const col = await getConversations();
  const agg = await col.aggregate([{ $group: { _id: null, total: { $sum: "$unreadForStaff" } } }]).toArray();
  return agg[0]?.total || 0;
}

export async function saveChatAttachment({ uid, name, size, type, data }) {
  const col = await getAttachmentsCol();
  const _id = new ObjectId();
  await col.insertOne({ _id, uid: uid || null, name, size, type, data: Buffer.from(data), createdAt: new Date() });
  return { id: String(_id), name, size, type, uploadedAt: new Date().toISOString() };
}

export async function getChatAttachment(id) {
  const col = await getAttachmentsCol();
  if (!ObjectId.isValid(id)) return null;
  return col.findOne({ _id: new ObjectId(id) });
}

export async function createCall({ conversationId, initiatorId, receiverId, callType }) {
  const col = await getCallsCol();
  const callId = newId("call");
  const now = new Date();
  const doc = {
    callId,
    conversationId,
    initiatorId,
    receiverId: receiverId || null,
    callType,
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

export async function updateCall(callId, updates) {
  const col = await getCallsCol();
  await col.updateOne({ callId }, { $set: { ...updates, updatedAt: new Date() } });
  return col.findOne({ callId });
}

export async function getCall(callId) {
  const col = await getCallsCol();
  return col.findOne({ callId });
}

export async function listCalls(conversationId, limit = 50) {
  const col = await getCallsCol();
  return col.find({ conversationId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function getStaffUsers() {
  const db = await getDb();
  const users = await db.collection("users").find({ role: { $in: STAFF_ROLES } }).project({ password: 0 }).toArray();
  return users.map((u) => ({
    uid: u.uid,
    displayName: u.displayName || u.email || "Staff",
    email: u.email || "",
    role: u.role,
    avatar: u.avatar || null,
  }));
}

export async function getUserByUid(uid) {
  const db = await getDb();
  return db.collection("users").findOne({ uid }, { projection: { password: 0 } });
}
