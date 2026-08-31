import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";
import { AD_ACCOUNT_LIST_PROJECTION, USER_AD_ACCOUNT_PROJECTION } from "./projections";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function getAdAccountsByUid(uid) {
  if (!uid) return [];
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").find({ uid, unassignedAt: null }).project(USER_AD_ACCOUNT_PROJECTION).sort({ createdAt: -1 }).toArray();
}

export async function getAllAdAccounts(includeUnassigned = false) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const filter = includeUnassigned ? {} : { unassignedAt: null };
  return db.collection("adAccounts").find(filter).project(AD_ACCOUNT_LIST_PROJECTION).sort({ createdAt: -1 }).toArray();
}

export async function getAllAdAccountsForSync() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").find({
    metaAccountId: { $ne: "", $exists: true },
    unassignedAt: null,
  }).project({ _id: 1, name: 1, accountId: 1, metaAccountId: 1, currency: 1, spendCap: 1, spent: 1, status: 1, lastSyncedAt: 1, syncStatus: 1, syncError: 1 }).toArray();
}

export async function getUnassignedAdAccounts() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").find({ uid: { $in: [null, ""] }, unassignedAt: null }).project(AD_ACCOUNT_LIST_PROJECTION).sort({ createdAt: -1 }).toArray();
}

export async function updateAdAccountsBatch(updates) {
  if (!updates || updates.length === 0) return 0;
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const bulk = db.collection("adAccounts").initializeUnorderedBulkOp();
  for (const u of updates) {
    if (!u.id) continue;
    bulk.find({ _id: new ObjectId(u.id) }).updateOne({ $set: u.updates });
  }
  const result = await bulk.execute();
  return result.nModified || 0;
}

export async function getAdAccountByMetaId(metaAccountId) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").findOne({ metaAccountId });
}

export async function getAdAccountByAccountId(accountId) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").findOne({ accountId });
}

export async function createAdAccount({ uid, email, name, accountId, budget, status = "active", metaAccountId, metaAccountName, currency, spendCap, assignedBy }) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  if (accountId) {
    const existing = await db.collection("adAccounts").findOne({ accountId });
    if (existing) {
      throw new Error(`An ad account with Account ID "${accountId}" already exists.`);
    }
  }

  const doc = {
    uid: uid || "",
    email: email || "",
    name: name || `Ad Account ${Date.now()}`,
    accountId: accountId || `AD_${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    metaAccountId: metaAccountId || "",
    metaAccountName: metaAccountName || "",
    currency: currency || "USD",
    spendCap: Number(spendCap || 0),
    status,
    budget: Number(budget || 0),
    spent: 0,
    assignedBy: assignedBy || null,
    assignedAt: uid ? new Date() : null,
    unassignedAt: null,
    lastSyncedAt: null,
    syncStatus: "pending",
    syncError: null,
    lastInsights: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection("adAccounts").insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateAdAccount(accountId, updates) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  if (updates.accountId) {
    const existing = await db.collection("adAccounts").findOne({ accountId: updates.accountId, _id: { $ne: new ObjectId(accountId) } });
    if (existing) {
      throw new Error(`An ad account with Account ID "${updates.accountId}" already exists.`);
    }
  }

  const setFields = { ...updates, updatedAt: new Date() };
  delete setFields._id;

  if (updates._id) {
    delete setFields._id;
  }

  const result = await db.collection("adAccounts").findOneAndUpdate(
    { _id: new ObjectId(accountId) },
    { $set: setFields },
    { returnDocument: "after" }
  );

  return result.value;
}

export async function assignAdAccount(accountId, uid, email, assignedBy) {
  return updateAdAccount(accountId, {
    uid,
    email: email || "",
    assignedBy,
    assignedAt: new Date(),
    unassignedAt: null,
  });
}

export async function unassignAdAccount(accountId) {
  return updateAdAccount(accountId, {
    uid: "",
    email: "",
    assignedBy: null,
    unassignedAt: new Date(),
  });
}

export async function deleteAdAccount(accountId) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("adAccounts").deleteOne({ _id: new ObjectId(accountId) });
}

export async function deleteAllAdAccounts() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").deleteMany({});
}

export async function deleteUnassignedAdAccounts() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("adAccounts").deleteMany({ uid: { $in: [null, ""] }, unassignedAt: null });
}
