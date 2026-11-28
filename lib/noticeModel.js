import clientPromise from "./mongodb";
import { initializeIndexes } from "./indexes";
import { ObjectId } from "mongodb";
import { COMPANY_NAME, priorityRank } from "./noticeConstants";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getDb() {
  await initializeIndexes();
  const client = await clientPromise;
  return client.db(DB_NAME);
}

async function getNoticesCollection() {
  return (await getDb()).collection("notices");
}

async function getRecipientsCollection() {
  return (await getDb()).collection("noticeRecipients");
}

async function getUsersCollection() {
  return (await getDb()).collection("users");
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validObjectId(id) {
  return id && ObjectId.isValid(String(id));
}

// Admin-facing serialization: full metadata but no internal audit history by
// default (kept small for list responses).
export function serializeNotice(doc, { withHistory = false } = {}) {
  if (!doc) return null;
  const out = {
    _id: String(doc._id),
    title: doc.title || "",
    message: doc.message || "",
    type: doc.type || "General Announcement",
    priority: doc.priority || "normal",
    priorityRank: doc.priorityRank ?? priorityRank(doc.priority),
    audienceType: doc.audienceType || "all",
    targetCustomerIds: (doc.targetCustomerIds || []).map(String),
    audienceCount: doc.audienceCount || 0,
    targetCustomerDetails: doc.targetCustomerDetails || [],
    changeKind: doc.changeKind || null,
    structuredChanges: doc.structuredChanges || [],
    status: doc.status || "draft",
    company: doc.company || COMPANY_NAME,
    publishedAt: toIso(doc.publishedAt),
    effectiveAt: toIso(doc.effectiveAt),
    expiresAt: toIso(doc.expiresAt),
    scheduledAt: toIso(doc.scheduledAt),
    requireAcknowledgement: Boolean(doc.requireAcknowledgement),
    revisionOf: doc.revisionOf ? String(doc.revisionOf) : null,
    editCount: doc.editCount || 0,
    createdBy: doc.createdBy || null,
    updatedBy: doc.updatedBy || null,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
  if (withHistory) out.history = (doc.history || []).map((h) => ({ ...h, at: toIso(h.at) }));
  return out;
}

// Customer-facing serialization deliberately omits targetCustomerIds and
// admin/user metadata — a recipient must never learn who else got a notice.
export function serializeCustomerNotice(doc, recipient = null) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    title: doc.title || "",
    message: doc.message || "",
    type: doc.type || "General Announcement",
    priority: doc.priority || "normal",
    priorityRank: doc.priorityRank ?? priorityRank(doc.priority),
    audienceType: doc.audienceType || "all",
    changeKind: doc.changeKind || null,
    structuredChanges: doc.structuredChanges || [],
    company: doc.company || COMPANY_NAME,
    publishedAt: toIso(doc.publishedAt),
    effectiveAt: toIso(doc.effectiveAt),
    expiresAt: toIso(doc.expiresAt),
    requireAcknowledgement: Boolean(doc.requireAcknowledgement),
    isImportant: (doc.priorityRank ?? priorityRank(doc.priority)) >= 2 || doc.type === "Important Notice",
    recipient: recipient
      ? {
          readAt: toIso(recipient.readAt),
          acknowledgedAt: toIso(recipient.acknowledgedAt),
          deliveredAt: toIso(recipient.deliveredAt),
        }
      : { readAt: null, acknowledgedAt: null, deliveredAt: null },
  };
}

// A notice is visible only when it is live, published, within its effective /
// expiry window, and addressed to this exact uid (or to everyone).
export function buildEligibilityFilter(uid, now = new Date()) {
  return {
    status: "published",
    publishedAt: { $exists: true, $ne: null, $lte: now },
    $and: [
      { $or: [{ effectiveAt: null }, { effectiveAt: { $exists: false } }, { effectiveAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      { $or: [{ audienceType: "all" }, { audienceType: "individual", targetCustomerIds: String(uid) }] },
    ],
  };
}

function lookupRecipient(uid) {
  return {
    $lookup: {
      from: "noticeRecipients",
      let: { noticeId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$noticeId", "$$noticeId"] },
                { $eq: ["$uid", String(uid)] },
              ],
            },
          },
        },
        { $project: { _id: 0, readAt: 1, acknowledgedAt: 1, deliveredAt: 1 } },
      ],
      as: "recipient",
    },
  };
}

const WITH_RECIPIENT_STAGES = [
  { $addFields: { recipient: { $ifNull: [{ $arrayElemAt: ["$recipient", 0] }, null] } } },
];

function customerPipeline(uid, { unreadOnly, pendingAck, importantOnly, needsAction } = {}) {
  const pipeline = [
    { $match: buildEligibilityFilter(uid) },
    lookupRecipient(uid),
    ...WITH_RECIPIENT_STAGES,
    { $addFields: { isImportant: { $or: [{ $gte: ["$priorityRank", 2] }, { $eq: ["$type", "Important Notice"] }] } } },
  ];
  if (unreadOnly) pipeline.push({ $match: { $or: [{ recipient: null }, { "recipient.readAt": null }] } });
  if (pendingAck) {
    pipeline.push({
      $match: {
        requireAcknowledgement: true,
        $or: [{ recipient: null }, { "recipient.acknowledgedAt": null }],
      },
    });
  }
  // Notices that still require customer attention: never read yet, OR read but
  // not acknowledged when acknowledgement is mandatory. This is the queue the
  // global modal provider uses after publish, login, refresh and reconnect.
  if (needsAction) {
    pipeline.push({
      $match: {
        $or: [
          { recipient: null },
          { "recipient.readAt": null },
          {
            $and: [
              { requireAcknowledgement: true },
              { $or: [{ recipient: null }, { "recipient.acknowledgedAt": null }] },
            ],
          },
        ],
      },
    });
  }
  if (importantOnly) pipeline.push({ $match: { isImportant: true } });
  return pipeline;
}

export async function getCustomerNotices(uid, options = {}) {
  if (!uid) return { notices: [], total: 0, unread: 0, pendingAck: 0, page: 1, limit: 20, totalPages: 1 };
  const collection = await getNoticesCollection();
  const safeLimit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const safePage = Math.max(Number(options.page) || 1, 1);
  const pipeline = customerPipeline(uid, options);
  pipeline.push({
    $facet: {
      items: [
        { $sort: { priorityRank: -1, publishedAt: -1, _id: -1 } },
        { $skip: (safePage - 1) * safeLimit },
        { $limit: safeLimit },
      ],
      meta: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: {
              $sum: {
                $cond: [{ $or: [{ $eq: ["$recipient", null] }, { $eq: ["$recipient.readAt", null] }] }, 1, 0],
              },
            },
            pendingAck: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$requireAcknowledgement", true] },
                      { $or: [{ $eq: ["$recipient", null] }, { $eq: ["$recipient.acknowledgedAt", null] }] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ],
    },
  });
  const [result] = await collection.aggregate(pipeline).toArray();
  const meta = result?.meta?.[0] || { total: 0, unread: 0, pendingAck: 0 };
  return {
    notices: (result?.items || []).map((doc) => serializeCustomerNotice(doc, doc.recipient)),
    total: meta.total || 0,
    unread: meta.unread || 0,
    pendingAck: meta.pendingAck || 0,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil((meta.total || 0) / safeLimit)),
  };
}

export async function getCustomerNoticeCounts(uid) {
  if (!uid) return { total: 0, unread: 0, pendingAck: 0, importantUnread: 0 };
  const collection = await getNoticesCollection();
  const pipeline = customerPipeline(uid);
  pipeline.push({
    $group: {
      _id: null,
      total: { $sum: 1 },
      unread: {
        $sum: { $cond: [{ $or: [{ $eq: ["$recipient", null] }, { $eq: ["$recipient.readAt", null] }] }, 1, 0] },
      },
      pendingAck: {
        $sum: {
          $cond: [
            { $and: [{ $eq: ["$requireAcknowledgement", true] }, { $or: [{ $eq: ["$recipient", null] }, { $eq: ["$recipient.acknowledgedAt", null] }] }] },
            1,
            0,
          ],
        },
      },
      importantUnread: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$isImportant", true] },
                { $or: [{ $eq: ["$recipient", null] }, { $eq: ["$recipient.readAt", null] }] },
              ],
            },
            1,
            0,
          ],
        },
      },
    },
  });
  const [result] = await collection.aggregate(pipeline).toArray();
  return {
    total: result?.total || 0,
    unread: result?.unread || 0,
    pendingAck: result?.pendingAck || 0,
    importantUnread: result?.importantUnread || 0,
  };
}

export async function getCustomerNoticeById(uid, id) {
  if (!uid || !validObjectId(id)) return null;
  const collection = await getNoticesCollection();
  const pipeline = [
    { $match: { $and: [{ _id: new ObjectId(String(id)) }, buildEligibilityFilter(uid)] } },
    lookupRecipient(uid),
    ...WITH_RECIPIENT_STAGES,
    { $addFields: { isImportant: { $or: [{ $gte: ["$priorityRank", 2] }, { $eq: ["$type", "Important Notice"] }] } } },
    { $limit: 1 },
  ];
  const [doc] = await collection.aggregate(pipeline).toArray();
  return doc ? serializeCustomerNotice(doc, doc.recipient) : null;
}

// Idempotent, concurrency-safe recipient upsert. The unique (noticeId, uid)
// index prevents duplicates; a racing insert is reconciled with a plain update.
async function upsertRecipient(uid, noticeId, fields) {
  const collection = await getRecipientsCollection();
  const now = new Date();
  const key = { noticeId: new ObjectId(String(noticeId)), uid: String(uid) };
  try {
    await collection.updateOne(
      key,
      {
        $setOnInsert: { deliveredAt: now, createdAt: now },
        $set: { ...fields, updatedAt: now },
      },
      { upsert: true }
    );
    return true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await collection.updateOne(key, { $set: { ...fields, updatedAt: now } });
    return true;
  }
}

export async function markNoticeRead(uid, noticeId) {
  return upsertRecipient(uid, noticeId, { readAt: new Date() });
}

export async function acknowledgeNotice(uid, noticeId) {
  const collection = await getRecipientsCollection();
  const key = { noticeId: new ObjectId(String(noticeId)), uid: String(uid) };
  const now = new Date();
  const existing = await collection.findOne(key, { projection: { readAt: 1, acknowledgedAt: 1 } });
  const fields = {
    readAt: existing?.readAt || now,
    acknowledgedAt: existing?.acknowledgedAt || now,
  };
  try {
    await collection.updateOne(
      key,
      { $setOnInsert: { deliveredAt: now, createdAt: now }, $set: { ...fields, updatedAt: now } },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await collection.updateOne(key, { $set: { ...fields, updatedAt: now } });
  }
  return getRecipientState(uid, noticeId);
}

export async function getRecipientState(uid, noticeId) {
  if (!uid || !validObjectId(noticeId)) return null;
  const collection = await getRecipientsCollection();
  const doc = await collection.findOne(
    { noticeId: new ObjectId(String(noticeId)), uid: String(uid) },
    { projection: { readAt: 1, acknowledgedAt: 1, deliveredAt: 1 } }
  );
  return doc
    ? { readAt: toIso(doc.readAt), acknowledgedAt: toIso(doc.acknowledgedAt), deliveredAt: toIso(doc.deliveredAt) }
    : { readAt: null, acknowledgedAt: null, deliveredAt: null };
}

export async function createNoticeDocuments(noticeId, uids) {
  if (!uids?.length) return 0;
  const collection = await getRecipientsCollection();
  const now = new Date();
  const docs = uids.map((uid) => ({
    noticeId: new ObjectId(String(noticeId)),
    uid: String(uid),
    deliveredAt: now,
    readAt: null,
    acknowledgedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  try {
    await collection.insertMany(docs, { ordered: false });
  } catch (error) {
    // 11000 only means some recipient rows already existed (e.g. a retry).
    if (error?.code !== 11000) throw error;
  }
  return uids.length;
}

// ---------- Admin operations ----------

export async function createNotice(data, actor) {
  const collection = await getNoticesCollection();
  const now = new Date();
  const doc = {
    ...data,
    company: COMPANY_NAME,
    audienceCount: data.audienceType === "individual" ? data.targetCustomerIds.length : 0,
    createdBy: actor,
    updatedBy: null,
    revisionOf: data.revisionOf ? new ObjectId(String(data.revisionOf)) : null,
    editCount: 0,
    history: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(doc);
  if (data.audienceType === "individual" && data.status === "published") {
    await createNoticeDocuments(result.insertedId, data.targetCustomerIds);
  }
  return serializeNotice({ ...doc, _id: result.insertedId }, { withHistory: true });
}

export async function getNoticeById(id) {
  if (!validObjectId(id)) return null;
  const collection = await getNoticesCollection();
  return collection.findOne({ _id: new ObjectId(String(id)) });
}

export async function listNotices({ status, type, audienceType, search, page, limit } = {}) {
  const collection = await getNoticesCollection();
  const filter = {};
  if (status && status !== "all") filter.status = status;
  else filter.status = { $ne: "deleted" }; // tombstones stay in Mongo, hidden from the list
  if (type && type !== "all") filter.type = type;
  if (audienceType && audienceType !== "all") filter.audienceType = audienceType;
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.title = { $regex: escaped, $options: "i" };
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const [notices, total, counts] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).toArray(),
    collection.countDocuments(filter),
    Promise.all(["draft", "scheduled", "published", "archived"].map((s) => collection.countDocuments({ status: s }))),
  ]);
  return {
    notices: notices.map((doc) => serializeNotice(doc)),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    counts: { draft: counts[0], scheduled: counts[1], published: counts[2], archived: counts[3] },
  };
}

export async function updateNoticeFields(id, updates, actor, historyEntry = null) {
  const collection = await getNoticesCollection();
  const now = new Date();
  const set = { ...updates, updatedBy: actor, updatedAt: now };
  if (historyEntry) {
    const res = await collection.updateOne(
      { _id: new ObjectId(String(id)) },
      { $set: set, $push: { history: { $each: [{ ...historyEntry, at: now, by: actor?.uid || null }], $slice: -30 } }, $inc: { editCount: 1 } }
    );
    return res.matchedCount > 0;
  }
  const res = await collection.updateOne({ _id: new ObjectId(String(id)) }, { $set: set });
  return res.matchedCount > 0;
}

// Scheduled notices are promoted lazily on the first customer read after
// their publish time. A cheap count keeps the common path to one indexed
// query; only due notices are processed. findOneAndUpdate with a status guard
// makes concurrent requests publish each notice exactly once.
export async function getDueScheduledNoticeIds(now = new Date(), limit = 50) {
  const collection = await getNoticesCollection();
  const docs = await collection
    .find({ status: "scheduled", scheduledAt: { $exists: true, $ne: null, $lte: now } }, { projection: { _id: 1 } })
    .limit(limit)
    .toArray();
  return docs.map((d) => String(d._id));
}

export async function promoteScheduledNotice(id, now = new Date()) {
  if (!validObjectId(id)) return null;
  const collection = await getNoticesCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(String(id)), status: "scheduled" },
    {
      $set: {
        status: "published",
        publishedAt: now,
        scheduledAt: null,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  return result.value || null;
}

export async function deleteDraftNotice(id) {
  if (!validObjectId(id)) return false;
  const collection = await getNoticesCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(String(id)), status: "draft" });
  if (result.deletedCount === 0) return false;
  const recipients = await getRecipientsCollection();
  await recipients.deleteMany({ noticeId: new ObjectId(String(id)) });
  return true;
}

// Delete a single notice. Drafts/scheduled notices were never visible to
// customers, so they are removed outright together with their own recipient
// rows. Published/archived notices may have read/acknowledgement history, so
// they are tombstoned instead: customers stop seeing them (eligibility
// requires status "published") while the notice, history and recipient
// records stay intact. Only this notice's documents are ever touched.
export async function deleteNotice(id, actor = null) {
  if (!validObjectId(id)) return null;
  const objectId = new ObjectId(String(id));
  const collection = await getNoticesCollection();
  const notice = await collection.findOne({ _id: objectId });
  if (!notice) return null;

  if (notice.status === "draft" || notice.status === "scheduled") {
    const result = await collection.deleteOne({ _id: objectId });
    if (result.deletedCount === 0) return null;
    await (await getRecipientsCollection()).deleteMany({ noticeId: objectId });
    return { mode: "hard", notice };
  }

  const now = new Date();
  await collection.updateOne(
    { _id: objectId },
    {
      $set: { status: "deleted", deletedAt: now, deletedBy: actor || null, updatedAt: now },
      $push: { history: { $each: [{ action: "deleted", at: now, by: actor?.uid || null }], $slice: -30 } },
      $inc: { editCount: 1 },
    }
  );
  return { mode: "soft", notice };
}

export async function getAudienceCountForNotice(notice) {
  if (!notice) return 0;
  if (notice.audienceType === "individual") {
    return (notice.targetCustomerIds || []).length;
  }
  const users = await getUsersCollection();
  return users.countDocuments({ role: "customer" });
}

export async function getRecipientStats(notice) {
  if (!notice) return { total: 0, read: 0, unread: 0, acknowledged: 0, delivered: 0 };
  const recipients = await getRecipientsCollection();
  const [stats] = await recipients.aggregate([
    { $match: { noticeId: new ObjectId(String(notice._id)) } },
    {
      $group: {
        _id: null,
        delivered: { $sum: 1 },
        read: { $sum: { $cond: [{ $ne: ["$readAt", null] }, 1, 0] } },
        acknowledged: { $sum: { $cond: [{ $ne: ["$acknowledgedAt", null] }, 1, 0] } },
      },
    },
  ]).toArray();
  const total = await getAudienceCountForNotice(notice);
  const read = stats?.read || 0;
  return {
    total,
    delivered: stats?.delivered || 0,
    read,
    acknowledged: stats?.acknowledged || 0,
    unread: Math.max(0, total - read),
  };
}

export async function getRecipientStatsForNotices(notices) {
  if (!notices?.length) return {};
  const recipientCollection = await getRecipientsCollection();
  const ids = notices.map((n) => new ObjectId(String(n._id)));
  const groups = await recipientCollection.aggregate([
    { $match: { noticeId: { $in: ids } } },
    {
      $group: {
        _id: "$noticeId",
        delivered: { $sum: 1 },
        read: { $sum: { $cond: [{ $ne: ["$readAt", null] }, 1, 0] } },
        acknowledged: { $sum: { $cond: [{ $ne: ["$acknowledgedAt", null] }, 1, 0] } },
      },
    },
  ]).toArray();
  const byId = new Map(groups.map((g) => [String(g._id), g]));
  // One count serves every global notice in this page. This MUST be awaited:
  // returning the countDocuments() promise made NextResponse.json serialize it
  // as `{}`, and React then crashed rendering that object as a table cell.
  const hasGlobal = notices.some((n) => n.audienceType === "all");
  const globalTotal = hasGlobal
    ? await (await getUsersCollection()).countDocuments({ role: "customer" })
    : 0;
  const result = {};
  for (const notice of notices) {
    const g = byId.get(String(notice._id)) || { delivered: 0, read: 0, acknowledged: 0 };
    const total = Number(
      notice.audienceType === "all"
        ? globalTotal
        : (notice.audienceCount || (notice.targetCustomerIds || []).length)
    ) || 0;
    const read = Number(g.read) || 0;
    result[String(notice._id)] = {
      total,
      delivered: Number(g.delivered) || 0,
      read,
      acknowledged: Number(g.acknowledged) || 0,
      unread: Math.max(0, total - read),
    };
  }
  return result;
}

export async function listRecipients(notice, { page, limit } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const users = await getUsersCollection();
  const recipients = await getRecipientsCollection();
  const noticeId = new ObjectId(String(notice._id));

  let userFilter = { role: "customer" };
  let total;
  if (notice.audienceType === "individual") {
    const uids = (notice.targetCustomerIds || []).map(String);
    userFilter = { role: "customer", uid: { $in: uids } };
    total = uids.length;
  } else {
    total = await users.countDocuments(userFilter);
  }

  const docs = await users
    .find(userFilter, { projection: { uid: 1, displayName: 1, email: 1, customId: 1, phoneNumber: 1, accountStatus: 1 } })
    .sort({ createdAt: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit)
    .toArray();
  const uids = docs.map((d) => String(d.uid));
  const states = await recipients
    .find({ noticeId, uid: { $in: uids } }, { projection: { uid: 1, readAt: 1, acknowledgedAt: 1, deliveredAt: 1 } })
    .toArray();
  const byUid = new Map(states.map((s) => [String(s.uid), s]));
  return {
    recipients: docs.map((d) => ({
      uid: d.uid,
      displayName: d.displayName || "",
      email: d.email || "",
      customId: d.customId || "",
      phoneNumber: d.phoneNumber || "",
      accountStatus: d.accountStatus || "active",
      readAt: toIso(byUid.get(String(d.uid))?.readAt),
      acknowledgedAt: toIso(byUid.get(String(d.uid))?.acknowledgedAt),
      deliveredAt: toIso(byUid.get(String(d.uid))?.deliveredAt),
    })),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

// Resolve recipient references to the canonical Firebase uid used by the
// customer APIs. The admin picker selects customers by their real MongoDB
// `_id`; legacy notices stored uid strings instead. Both are accepted here,
// but email is NEVER used as a database reference.
export async function resolveCustomerIds(inputIds) {
  const ids = Array.from(new Set((inputIds || []).map(String).filter(Boolean)));
  if (ids.length === 0) return { validUids: [], valid: [], invalid: [], details: [] };
  const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const or = [{ uid: { $in: ids } }];
  if (objectIds.length > 0) or.push({ _id: { $in: objectIds } });
  const users = await getUsersCollection();
  const found = await users
    .find(
      { role: "customer", $or: or },
      { projection: { uid: 1, displayName: 1, email: 1, customId: 1, phoneNumber: 1, accountStatus: 1 } }
    )
    .toArray();
  const byUid = new Map(found.map((d) => [String(d.uid), d]));
  const byMongoId = new Map(found.map((d) => [String(d._id), d]));
  const validUids = [];
  const details = [];
  const invalid = [];
  for (const id of ids) {
    const doc = byUid.get(id) || byMongoId.get(id);
    if (!doc) { invalid.push(id); continue; }
    const uid = String(doc.uid);
    if (validUids.includes(uid)) continue;
    validUids.push(uid);
    details.push({
      mongoId: String(doc._id),
      uid,
      displayName: doc.displayName || "",
      email: doc.email || "",
      customId: doc.customId || "",
    });
  }
  return { validUids, valid: validUids, invalid, details };
}

// Backward-compatible wrapper for older callers.
export async function validateCustomerUids(uids) {
  return resolveCustomerIds(uids);
}

export async function searchNoticeRecipients({ q, page, limit } = {}) {
  const users = await getUsersCollection();
  const filter = { role: "customer" };
  const term = String(q || "").trim();
  if (term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { displayName: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
      { customId: { $regex: escaped, $options: "i" } },
      { phoneNumber: { $regex: escaped, $options: "i" } },
      { uid: { $regex: escaped, $options: "i" } },
    ];
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const [docs, total] = await Promise.all([
    users
      .find(filter, { projection: { uid: 1, displayName: 1, email: 1, customId: 1, phoneNumber: 1, accountStatus: 1 } })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    users.countDocuments(filter),
  ]);
  return {
    customers: docs.map((d) => ({
      // The stable MongoDB id is the selection key; `uid` is the auth
      // reference the server resolves it to. Searching by email never makes
      // email the stored recipient reference.
      mongoId: String(d._id),
      uid: d.uid,
      displayName: d.displayName || "",
      email: d.email || "",
      customId: d.customId || "",
      phoneNumber: d.phoneNumber || "",
      accountStatus: d.accountStatus || "active",
    })),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}
