import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const COLLECTION = "platforms";

// The advertising platforms are managed by the existing platform module in
// the shared `ad_buzz` database (Level 2 /platforms). This module is the
// read-only bridge used by Ad Account Requests — options must never be
// hardcoded in the request form.

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTION);
}

function isActive(doc) {
  const status = doc?.status;
  if (status === undefined || status === null || status === "") return true;
  return String(status).trim().toLowerCase() === "active";
}

function normalize(doc) {
  const name = String(doc.platformName || doc.name || doc.label || "").trim();
  if (!name) return null;
  return {
    id: String(doc.platformId || doc._id || name),
    name,
    logo: doc.platformLogo || doc.logo || "",
    status: doc.status || "Active",
  };
}

export async function getActivePlatforms() {
  const collection = await getCollection();
  const docs = await collection.find({}).sort({ platformName: 1 }).toArray();
  return docs.filter(isActive).map(normalize).filter(Boolean);
}

export async function findActivePlatform(nameOrId) {
  const key = String(nameOrId || "").trim();
  if (!key) return null;
  const platforms = await getActivePlatforms();
  return platforms.find(
    (p) => p.name.toLowerCase() === key.toLowerCase() || p.id.toLowerCase() === key.toLowerCase()
  ) || null;
}
