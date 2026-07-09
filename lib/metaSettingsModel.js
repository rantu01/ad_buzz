import clientPromise from "./mongodb";

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
  await db.collection("metaAdAccounts").deleteMany({});
  if (accounts.length > 0) {
    const docs = accounts.map((a) => ({
      ...a,
      importedAt: new Date(),
    }));
    await db.collection("metaAdAccounts").insertMany(docs);
  }
}

export async function getMetaAdAccounts() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("metaAdAccounts").find().sort({ name: 1 }).toArray();
}

const MAX_SYNC_LOGS = 15;

export async function createSyncLog(entry) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("syncLogs").insertOne({ ...entry, createdAt: new Date() });
  const overflow = await db.collection("syncLogs").countDocuments();
  if (overflow > MAX_SYNC_LOGS) {
    const toDelete = overflow - MAX_SYNC_LOGS;
    const oldest = await db.collection("syncLogs")
      .find()
      .sort({ createdAt: 1 })
      .limit(toDelete)
      .toArray();
    if (oldest.length > 0) {
      const ids = oldest.map((o) => o._id);
      await db.collection("syncLogs").deleteMany({ _id: { $in: ids } });
    }
  }
}

export async function getSyncLogs(limit = MAX_SYNC_LOGS) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("syncLogs").find().sort({ createdAt: -1 }).limit(limit).toArray();
}
