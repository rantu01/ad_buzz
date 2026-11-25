import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const COLLECTION = "adAccountRequests";

async function getCollection() {
  await initializeIndexes();
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTION);
}

function objectId(id) {
  const value = String(id || "");
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paging({ page, limit }, defaultLimit = 10) {
  const hasPaging = Number.isFinite(Number(page)) && Number.isFinite(Number(limit)) && Number(limit) > 0;
  const safePage = hasPaging ? Math.max(1, Math.floor(Number(page))) : 1;
  const safeLimit = hasPaging ? Math.min(Math.floor(Number(limit)), 100) : defaultLimit;
  return { safePage, safeLimit };
}

function pageResult(requests, total, safePage, safeLimit) {
  return {
    requests,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function createRequest(data) {
  const collection = await getCollection();
  const now = new Date();
  const doc = {
    // Identity is always the verified, authenticated user's uid.
    customerId: String(data.customerId),
    customerName: data.customerName || null,
    customerEmail: data.customerEmail || null,
    platform: data.platform,
    platformId: data.platformId || null,
    adAccountName: data.adAccountName,
    monthlyBudget: Number(data.monthlyBudget),
    product: data.product,
    businessManagerId: data.businessManagerId,
    websitePageLink: data.websitePageLink,
    status: "pending",
    adminNote: "",
    rejectionReason: "",
    customerNote: "",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    statusHistory: [
      {
        status: "pending",
        note: "Request submitted.",
        reason: "",
        by: String(data.customerId),
        byName: data.customerName || "Customer",
        role: "customer",
        at: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// Enrich list rows with the *current* customer profile from the users
// collection; the snapshot on the request is only a fallback.
async function attachCustomerInfo(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return [];
  const uids = [...new Set(requests.map((r) => String(r.customerId)).filter(Boolean))];
  if (uids.length === 0) return requests;
  const client = await clientPromise;
  const users = await client
    .db(DB_NAME)
    .collection("users")
    .find({ uid: { $in: uids } }, { projection: { uid: 1, displayName: 1, email: 1, customId: 1, role: 1 } })
    .toArray();
  const byUid = new Map(users.map((u) => [String(u.uid), u]));
  return requests.map((request) => {
    const user = byUid.get(String(request.customerId));
    return {
      ...request,
      customerName: user?.displayName || request.customerName || null,
      customerEmail: user?.email || request.customerEmail || null,
      customerCustomId: user?.customId || null,
    };
  });
}

export async function getRequestsByCustomerId(customerId, options = {}) {
  const collection = await getCollection();
  const { safePage, safeLimit } = paging(options);
  const filter = { customerId: String(customerId) };
  const [total, requests] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).toArray(),
  ]);
  return pageResult(requests, total, safePage, safeLimit);
}

// When customerId is supplied, a request that belongs to somebody else is
// indistinguishable from a missing one (defence against ID manipulation).
export async function getRequestById(id, customerId = null) {
  const _id = objectId(id);
  if (!_id) return null;
  const collection = await getCollection();
  const filter = customerId ? { _id, customerId: String(customerId) } : { _id };
  const request = await collection.findOne(filter);
  if (!request) return null;
  const [withCustomer] = await attachCustomerInfo([request]);
  return withCustomer || request;
}

export async function getAllRequests(filters = {}) {
  const collection = await getCollection();
  const filter = {};
  if (filters.status) filter.status = String(filters.status);
  if (filters.platform) filter.platform = String(filters.platform);
  if (filters.customer) {
    const term = String(filters.customer).trim();
    const pattern = { $regex: escapeRegex(term), $options: "i" };
    // Search the live users collection as well as the request snapshot so a
    // renamed customer is still found by their current name/email.
    const client = await clientPromise;
    const matchingUsers = await client
      .db(DB_NAME)
      .collection("users")
      .find({ $or: [{ displayName: pattern }, { email: pattern }] }, { projection: { uid: 1 } })
      .toArray();
    filter.$or = [
      { customerId: { $in: matchingUsers.map((u) => String(u.uid)) } },
      { customerName: pattern },
      { customerEmail: pattern },
    ];
  }
  if (filters.accountName) filter.adAccountName = { $regex: escapeRegex(String(filters.accountName).trim()), $options: "i" };
  if (filters.dateFrom || filters.dateTo) {
    filter.createdAt = {};
    if (filters.dateFrom) {
      const from = new Date(`${String(filters.dateFrom)}T00:00:00.000Z`);
      if (!Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    }
    if (filters.dateTo) {
      const to = new Date(`${String(filters.dateTo)}T23:59:59.999Z`);
      if (!Number.isNaN(to.getTime())) filter.createdAt.$lte = to;
    }
  }
  const { safePage, safeLimit } = paging(filters);
  const [total, rows] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).toArray(),
  ]);
  const requests = await attachCustomerInfo(rows);
  return pageResult(requests, total, safePage, safeLimit);
}

export async function getRequestStats() {
  const collection = await getCollection();
  const groups = await collection.aggregate([
    { $group: { _id: { $ifNull: ["$status", "pending"] }, count: { $sum: 1 } } },
  ]).toArray();
  const stats = {
    total: 0,
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    more_info_required: 0,
  };
  for (const group of groups) {
    const key = String(group._id);
    if (key in stats) stats[key] = group.count;
    stats.total += group.count;
  }
  return stats;
}

// Every status change is appended to statusHistory so both panels can show
// a complete, auditable trail. `reviewer` comes from the verified session.
export async function updateRequestStatus(id, { status, note = "", reason = "", reviewer }) {
  const _id = objectId(id);
  if (!_id) return null;
  const collection = await getCollection();
  const now = new Date();
  const historyEntry = {
    status,
    note: String(note || ""),
    reason: String(reason || ""),
    by: String(reviewer?.uid || ""),
    byName: reviewer?.name || "Admin",
    role: reviewer?.role || "admin",
    at: now,
  };
  const result = await collection.findOneAndUpdate(
    { _id },
    {
      $set: {
        status,
        adminNote: String(note || ""),
        rejectionReason: status === "rejected" ? String(reason || "") : "",
        reviewedBy: String(reviewer?.uid || ""),
        reviewedByName: reviewer?.name || "Admin",
        reviewedAt: now,
        updatedAt: now,
      },
      $push: { statusHistory: historyEntry },
    },
    { returnDocument: "after" }
  );
  const updated = result?.value || result;
  if (!updated) return null;
  const [withCustomer] = await attachCustomerInfo([updated]);
  return withCustomer || updated;
}

// Customer workflow: only requests asking for more information may be
// answered. Approved/rejected requests intentionally have no customer edit.
export async function addCustomerInfo(id, customerId, message) {
  const _id = objectId(id);
  if (!_id) return null;
  const collection = await getCollection();
  const now = new Date();
  const result = await collection.findOneAndUpdate(
    { _id, customerId: String(customerId), status: "more_info_required" },
    {
      $set: {
        status: "under_review",
        customerNote: String(message || ""),
        updatedAt: now,
      },
      $push: {
        statusHistory: {
          status: "under_review",
          note: String(message || ""),
          reason: "",
          by: String(customerId),
          byName: "Customer",
          role: "customer",
          at: now,
        },
      },
    },
    { returnDocument: "after" }
  );
  const updated = result?.value || result;
  if (!updated) return null;
  const [withCustomer] = await attachCustomerInfo([updated]);
  return withCustomer || updated;
}
