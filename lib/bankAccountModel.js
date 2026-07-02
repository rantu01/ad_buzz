import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection("bankAccounts");
}

export async function getBankAccountsByUid(uid) {
  const collection = await getCollection();
  return collection.find({ uid }).sort({ createdAt: -1 }).toArray();
}

export async function createBankAccount({ uid, bankName, accountName, accountNumber, branch, referenceId, shortCode, color }) {
  const collection = await getCollection();
  const doc = {
    uid,
    bankName,
    accountName,
    accountNumber,
    branch,
    referenceId,
    shortCode: shortCode || "",
    color: color || "#135B9A",
    createdAt: new Date(),
  };
  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function deleteBankAccount(accountId, uid) {
  const collection = await getCollection();
  return collection.deleteOne({ _id: new ObjectId(accountId), uid });
}
