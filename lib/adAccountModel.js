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

/**
 * Create `adAccounts` docs for Meta-fetched accounts that don't have one yet.
 *
 * Root-cause fix: `metaAdAccounts` is refreshed from Meta on every fetch
 * (manual "Fetch from Meta BM", cron, auto-fetch), but `adAccounts` — the
 * collection read by `/api/admin/ad-accounts` and therefore by the
 * `ad-accounts-topup` page — was only populated by the manual, destructive
 * "Import from Meta" action. Any ad account added in Meta after the last
 * import (e.g. `act_1084989540925527` / `ADS_Adsbuzz_Agency_702`) existed in
 * `metaAdAccounts` yet never appeared on the top-up page.
 *
 * This upserts missing docs only (`$setOnInsert`), so existing assignments,
 * budgets and statuses are never overwritten. Safe to call on every fetch.
 *
 * @returns {Promise<number>} number of newly created ad accounts
 */
export async function ensureAdAccountsForMeta(metaAccounts) {
  if (!metaAccounts || metaAccounts.length === 0) return 0;
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const now = new Date();

  const bulk = db.collection("adAccounts").initializeUnorderedBulkOp();
  let opCount = 0;

  for (const ma of metaAccounts) {
    if (!ma.metaAccountId) continue;
    bulk.find({ metaAccountId: ma.metaAccountId }).upsert().updateOne({
      $setOnInsert: {
        uid: "",
        email: "",
        name: ma.name || `Ad Account ${ma.metaAccountId}`,
        accountId: ma.metaAccountId,
        metaAccountId: ma.metaAccountId,
        metaAccountName: ma.name || "",
        currency: ma.currency || "USD",
        spendCap: Number(ma.spendCap || 0),
        status: ma.accountStatus === 1 ? "active" : "paused",
        budget: Number(ma.spendCap || 0),
        spent: Number(ma.amountSpent || 0),
        assignedBy: null,
        assignedAt: null,
        unassignedAt: null,
        lastSyncedAt: now,
        syncStatus: "synced",
        syncError: null,
        lastInsights: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    opCount++;
  }

  if (opCount === 0) return 0;

  const result = await bulk.execute();
  return result.nUpserted || 0;
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
