import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getCollection() {
  await initializeIndexes();
  const client = await clientPromise;
  return client.db(DB_NAME).collection("supportTickets");
}

async function getNextTicketId() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await db.collection("counters").updateOne(
    { _id: "ticketId" },
    { $max: { seq: 202650000 } },
    { upsert: true }
  );

  const result = await db.collection("counters").findOneAndUpdate(
    { _id: "ticketId" },
    { $inc: { seq: 1 } },
    { returnDocument: "after" }
  );
  const counter = result.value || result;
  return `ADT${counter.seq}`;
}

export async function createTicket({ uid, email, subject, message, adAccountId, adAccountMetaId, adAccountName }) {
  const collection = await getCollection();
  const ticketId = await getNextTicketId();
  const doc = {
    ticketId,
    uid,
    email,
    subject,
    message,
    adAccountId: adAccountId || null,
    adAccountMetaId: adAccountMetaId || null,
    adAccountName: adAccountName || null,
    status: "open",
    replies: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
  };
  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function getTicketsByUid(uid) {
  const collection = await getCollection();
  return collection.find({ uid }).sort({ createdAt: -1 }).toArray();
}

// List rows exclude the heavy `replies` array (loaded on demand per
// ticket); everything else the table needs stays in the row.
const TICKET_LIST_PROJECTION = {
  ticketId: 1,
  uid: 1,
  email: 1,
  subject: 1,
  message: 1,
  adAccountId: 1,
  adAccountMetaId: 1,
  adAccountName: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
  closedAt: 1,
};

export async function getAllTickets(statusFilter = null, searchTicketId = null, { page, limit } = {}) {
  const collection = await getCollection();
  const filter = {};
  if (statusFilter) filter.status = statusFilter;
  if (searchTicketId) filter.ticketId = { $regex: searchTicketId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const usePaging = Number.isFinite(Number(page)) && Number.isFinite(Number(limit)) && Number(limit) > 0;
  const safePage = usePaging ? Math.max(1, Math.floor(Number(page))) : 1;
  const safeLimit = usePaging ? Math.min(Math.floor(Number(limit)), 200) : 0;

  const [total, tickets] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).project(TICKET_LIST_PROJECTION).sort({ createdAt: -1 })
      .skip(usePaging ? (safePage - 1) * safeLimit : 0)
      .limit(safeLimit)
      .toArray(),
  ]);

  if (!usePaging) return tickets;
  return { tickets, total, page: safePage, limit: safeLimit, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}

export async function getTicketById(ticketId) {
  const collection = await getCollection();
  return collection.findOne({ _id: new ObjectId(ticketId) });
}

// Number of tickets still requiring staff attention (every status except
// closed). Drives the sidebar badge + notification counts so they always
// match the ticket list (which treats non-closed as open work).
export async function countAttentionTickets() {
  const collection = await getCollection();
  return collection.countDocuments({ status: { $ne: "closed" } });
}

// ---------------------------------------------------------------------------
// Per-admin read state.
//
// The badge shows *unread* tickets: unresolved tickets this admin has not
// seen yet. Read markers live in `supportTicketReads` ({ ticketId, uid })
// so every admin has independent state, refreshes recompute from the DB
// (never from client-side counters), and closing a ticket automatically
// drops it for everyone (status filter). A customer reply deletes the
// ticket's read markers so all staff are re-notified.
// ---------------------------------------------------------------------------
const READ_COLLECTION = "supportTicketReads";

let readIndexPromise = null;
async function ensureTicketReadIndexes() {
  if (!readIndexPromise) {
    readIndexPromise = (async () => {
      const client = await clientPromise;
      await client
        .db(DB_NAME)
        .collection(READ_COLLECTION)
        .createIndex({ ticketId: 1, uid: 1 }, { unique: true, name: "ticket_reads_ticket_uid" });
    })().catch((error) => {
      readIndexPromise = null;
      throw error;
    });
  }
  return readIndexPromise;
}

async function getReadCollection() {
  const client = await clientPromise;
  await ensureTicketReadIndexes();
  return client.db(DB_NAME).collection(READ_COLLECTION);
}

// Single source of truth for the badge: { unread, pendingOpen, items }.
// `unread` = unresolved tickets with no read marker for `uid`.
// `pendingOpen` = all unresolved tickets (info only, never used for badge).
export async function getUnreadTicketState(uid, limit = 20) {
  const collection = await getCollection();
  const unresolved = await collection
    .find({ status: { $ne: "closed" } }, { projection: { _id: 1 } })
    .toArray();
  const pendingOpen = unresolved.length;

  if (!uid) return { unread: pendingOpen, pendingOpen, items: [] };

  const reads = await (await getReadCollection())
    .find({ uid: String(uid) }, { projection: { ticketId: 1 } })
    .toArray();
  const readSet = new Set(reads.map((r) => String(r.ticketId)));
  const unreadIds = unresolved
    .map((d) => d._id)
    .filter((id) => !readSet.has(String(id)));

  let items = [];
  if (unreadIds.length > 0) {
    items = await collection
      .find({ _id: { $in: unreadIds } })
      .project({ ticketId: 1, subject: 1, email: 1, status: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  return { unread: unreadIds.length, pendingOpen, items };
}

export async function markTicketsRead(uid, ticketIds) {
  if (!uid || !Array.isArray(ticketIds) || ticketIds.length === 0) return;
  const reads = await getReadCollection();
  await reads.bulkWrite(
    ticketIds.map((id) => ({
      updateOne: {
        filter: { ticketId: String(id), uid: String(uid) },
        update: { $set: { readAt: new Date() } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

export async function markAllTicketsRead(uid) {
  if (!uid) return;
  const collection = await getCollection();
  const unresolved = await collection
    .find({ status: { $ne: "closed" } }, { projection: { _id: 1 } })
    .toArray();
  await markTicketsRead(uid, unresolved.map((d) => String(d._id)));
}

// Customer replied: everyone must see this ticket as unread again.
export async function clearTicketReads(ticketId) {
  if (!ticketId) return;
  const reads = await getReadCollection();
  await reads.deleteMany({ ticketId: String(ticketId) });
}

export async function updateTicketStatus(ticketId, status) {
  const collection = await getCollection();
  const update = { status, updatedAt: new Date() };
  if (status === "closed") update.closedAt = new Date();
  return collection.findOneAndUpdate(
    { _id: new ObjectId(ticketId) },
    { $set: update },
    { returnDocument: "after" }
  );
}

export async function addTicketReply(ticketId, reply) {
  const collection = await getCollection();
  const replyDoc = {
    ...reply,
    createdAt: new Date(),
  };
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(ticketId) },
    {
      $push: { replies: replyDoc },
      $set: { updatedAt: new Date(), status: reply.role !== "customer" ? "replied" : "open" },
    },
    { returnDocument: "after" }
  );
  return result;
}
