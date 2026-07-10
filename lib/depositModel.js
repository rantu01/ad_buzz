import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getDepositsCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection("deposits");
}

export async function createDeposit({ uid, email, amount, amountBDT, account, transactionRef, creditedUSD, paymentMethod, screenshotBase64 = null }) {
  const collection = await getDepositsCollection();
  
  const deposit = {
    uid,
    email,
    amount: Number(amount),
    amountBDT: amountBDT ? Number(amountBDT) : null,
    account: account || null,
    transactionRef: transactionRef || null,
    creditedUSD: creditedUSD ? Number(creditedUSD) : null,
    paymentMethod: paymentMethod || null,
    screenshot: screenshotBase64 || null,
    status: "pending",
    createdAt: new Date(),
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
  };

  const result = await collection.insertOne(deposit);
  return { ...deposit, _id: result.insertedId };
}

export async function getDepositsByUid(uid) {
  const collection = await getDepositsCollection();
  return collection.find({ uid }).sort({ createdAt: -1 }).toArray();
}

export async function getAllDeposits() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const deposits = await db.collection("deposits").find({}).sort({ createdAt: -1 }).toArray();

  const paymentMethods = await db.collection("paymentMethods").find({}).toArray();

  const enriched = deposits.map((dep) => {
    const pmValue = dep.paymentMethod || "";
    const match = paymentMethods.find(
      (p) => p.walletName === pmValue || p.bankName === pmValue
    );
    return {
      ...dep,
      referenceId: match?.referenceId || null,
    };
  });

  return enriched;
}

export async function updateDepositStatus(depositId, status, approverUid = null, rejectionReason = null) {
  const collection = await getDepositsCollection();

  const updateDoc = {
    status,
    ...(status === "approved" && { approvedAt: new Date(), approverUid }),
    ...(status === "rejected" && { rejectedAt: new Date(), rejectionReason }),
  };

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(depositId) },
    { $set: updateDoc },
    { returnDocument: "after" }
  );

  return result;
}

export async function getDepositById(depositId) {
  const collection = await getDepositsCollection();
  return collection.findOne({ _id: new ObjectId(depositId) });
}
