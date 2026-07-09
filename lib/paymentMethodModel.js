import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection("paymentMethods");
}

export async function getAllPaymentMethods() {
  const collection = await getCollection();
  return collection.find({}).sort({ createdAt: -1 }).toArray();
}

export async function getPaymentMethodsByUid(uid) {
  const collection = await getCollection();
  return collection.find({ assignedUids: uid }).sort({ createdAt: -1 }).toArray();
}

export async function createPaymentMethod(fields) {
  const collection = await getCollection();
  const { type } = fields;

  const name = type === "mobile-banking" ? fields.walletName : fields.bankName;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const colorPalette = ["#1a5276", "#1e8449", "#2e86c1", "#a04000", "#7d3c98", "#c0392b", "#117a65", "#2471a3"];
  const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];

  const base = {
    type: type || "bank",
    shortCode: initials,
    color,
    assignedUids: [],
    createdAt: new Date(),
  };

  let doc;
  if (type === "mobile-banking") {
    doc = {
      ...base,
      walletName: fields.walletName,
      walletNo: fields.walletNo,
      accountType: fields.accountType,
      paymentInstructions: fields.paymentInstructions,
      referenceId: fields.referenceId,
      walletLogo: fields.walletLogo,
    };
  } else {
    doc = {
      ...base,
      bankName: fields.bankName,
      accountName: fields.accountName,
      accountNumber: fields.accountNumber,
      branch: fields.branch,
      referenceId: fields.referenceId,
      logo: fields.logo,
    };
  }

  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updatePaymentMethod(id, updates) {
  const collection = await getCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result;
}

export async function deletePaymentMethod(id) {
  const collection = await getCollection();
  return collection.deleteOne({ _id: new ObjectId(id) });
}

export async function assignPaymentMethodToUsers(methodId, uids) {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: new ObjectId(methodId) },
    { $set: { assignedUids: uids, updatedAt: new Date() } }
  );
}
