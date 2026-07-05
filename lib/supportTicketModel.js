import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection("supportTickets");
}

export async function createTicket({ uid, email, subject, message, adAccountId, adAccountMetaId, adAccountName }) {
  const collection = await getCollection();
  const doc = {
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

export async function getAllTickets(statusFilter = null) {
  const collection = await getCollection();
  const filter = statusFilter ? { status: statusFilter } : {};
  return collection.find(filter).sort({ createdAt: -1 }).toArray();
}

export async function getTicketById(ticketId) {
  const collection = await getCollection();
  return collection.findOne({ _id: new ObjectId(ticketId) });
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
