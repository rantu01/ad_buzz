import clientPromise from "./mongodb";
import { META_AD_ACCOUNT_PROJECTION } from "./projections";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function getMetaSettings() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("metaSettings").findOne({ _id: "global" });
}

export async function updateMetaSettings(updates) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const { _id, ...data } = updates;
  await db.collection("metaSettings").updateOne(
    { _id: "global" },
    { $set: { ...data, updatedAt: new Date() } },
    { upsert: true }
  );
  return getMetaSettings();
}

export async function saveMetaAdAccounts(accounts) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const bulk = db.collection("metaAdAccounts").initializeUnorderedBulkOp();
  const incomingIds = new Set();

  // Known-good prepaid Funds must survive a pass that couldn't read them
  // (bulk edge gaps / permission fallback return null).
  const existing = await db.collection("metaAdAccounts")
    .find({}, { projection: { metaAccountId: 1, prepaidBalance: 1 } })
    .toArray();
  const knownPrepaid = new Map(
    existing
      .filter((d) => typeof d.prepaidBalance === "number")
      .map((d) => [d.metaAccountId, d.prepaidBalance])
  );

  for (const a of accounts) {
    if (!a.metaAccountId) continue;
    incomingIds.add(a.metaAccountId);
    const setObj = { ...a, importedAt: new Date() };
    if (setObj.prepaidBalance == null && knownPrepaid.has(a.metaAccountId)) {
      delete setObj.prepaidBalance;
      delete setObj.prepaidBalanceStatus;
    }
    bulk.find({ metaAccountId: a.metaAccountId }).upsert().updateOne({
      $set: setObj,
      $setOnInsert: { createdAt: new Date() },
    });
  }

  if (accounts.length > 0) {
    await bulk.execute();
  }

  await db.collection("metaAdAccounts").deleteMany({
    metaAccountId: { $nin: Array.from(incomingIds) },
  });

  return accounts.length;
}

export async function getMetaAdAccounts() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("metaAdAccounts").find().project(META_AD_ACCOUNT_PROJECTION).sort({ name: 1 }).toArray();
}

const MAX_SYNC_LOGS = 15;

export async function createSyncLog(entry) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("syncLogs").insertOne({ ...entry, createdAt: new Date() });

  await db.collection("syncLogs")
    .find({}, { projection: { _id: 1 } })
    .sort({ createdAt: -1 })
    .skip(MAX_SYNC_LOGS)
    .limit(50)
    .forEach(async (doc) => {
      await db.collection("syncLogs").deleteMany({ _id: { $in: [doc._id] } });
    });
}

export async function getSyncLogs(limit = MAX_SYNC_LOGS) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("syncLogs").find().project({ message: 1, type: 1, details: 1, duration: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(limit).toArray();
}
