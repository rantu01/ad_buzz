import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection("site_settings");
}

export async function getSettings() {
  const collection = await getCollection();
  const settings = await collection.findOne({ _id: "global" });
  return settings || null;
}

export async function upsertSettings(data) {
  const collection = await getCollection();
  const update = {};
  if (data.siteName !== undefined) update.siteName = data.siteName;
  if (data.primaryColor !== undefined) update.primaryColor = data.primaryColor;
  if (data.secondaryColor !== undefined) update.secondaryColor = data.secondaryColor;
  if (data.logo !== undefined) update.logo = data.logo;

  const result = await collection.findOneAndUpdate(
    { _id: "global" },
    { $set: update, $setOnInsert: { _id: "global" } },
    { upsert: true, returnDocument: "after" }
  );
  return result;
}
