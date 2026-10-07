import clientPromise from "./mongodb";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getCollection() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const collection = db.collection("loginSessions");
  // Best-effort indexes for per-user newest-first listing + session upserts.
  try {
    await collection.createIndex({ uid: 1, lastActiveAt: -1 }).catch(() => {});
    await collection.createIndex({ uid: 1, sessionId: 1 }, { unique: true }).catch(() => {});
  } catch {}
  return collection;
}

export async function upsertLoginSession({
  uid,
  email = "",
  sessionId,
  deviceName = "Desktop",
  deviceType = "desktop",
  browser = "Unknown",
  browserVersion = "",
  os = "Unknown",
  userAgent = "",
  ip = "Unknown",
  city = "",
  country = "",
}) {
  if (!uid || !sessionId) throw new Error("uid and sessionId are required.");
  await initializeIndexes().catch(() => {});
  const collection = await getCollection();
  const now = new Date();

  await collection.updateOne(
    { uid, sessionId },
    {
      $set: {
        email,
        deviceName,
        deviceType,
        browser,
        browserVersion,
        os,
        userAgent,
        ip,
        city,
        country,
        lastActiveAt: now,
        updatedAt: now,
      },
      $setOnInsert: { uid, sessionId, createdAt: now },
    },
    { upsert: true }
  );

  return collection.findOne({ uid, sessionId });
}

export async function getLoginSessionsByUid(uid, limit = 20) {
  if (!uid) return [];
  const collection = await getCollection();
  return collection
    .find({ uid })
    .project({
      uid: 1,
      email: 1,
      sessionId: 1,
      deviceName: 1,
      deviceType: 1,
      browser: 1,
      browserVersion: 1,
      os: 1,
      ip: 1,
      city: 1,
      country: 1,
      lastActiveAt: 1,
      createdAt: 1,
    })
    .sort({ lastActiveAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 50))
    .toArray();
}

export async function deleteLoginSession(uid, sessionId) {
  if (!uid || !sessionId) throw new Error("uid and sessionId are required.");
  const collection = await getCollection();
  return collection.deleteOne({ uid, sessionId });
}
