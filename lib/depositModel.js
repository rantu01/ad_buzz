import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";
import { DEPOSIT_LIST_PROJECTION } from "./projections";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getDepositsCollection() {
  await initializeIndexes();
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
  return collection.find({ uid }).project(DEPOSIT_LIST_PROJECTION).sort({ createdAt: -1 }).toArray();
}

export async function getAllDeposits(status, { page, limit } = {}) {
  await initializeIndexes();
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const filter = status ? { status } : {};
  const usePaging = Number.isFinite(Number(page)) && Number.isFinite(Number(limit)) && Number(limit) > 0;
  const safePage = usePaging ? Math.max(1, Math.floor(Number(page))) : 1;
  const safeLimit = usePaging ? Math.min(Math.floor(Number(limit)), 200) : 0;

  const [total, deposits] = await Promise.all([
    db.collection("deposits").countDocuments(filter),
    db.collection("deposits").find(filter).project(DEPOSIT_LIST_PROJECTION).sort({ createdAt: -1 })
      .skip(usePaging ? (safePage - 1) * safeLimit : 0)
      .limit(safeLimit)
      .toArray(),
  ]);

  const paymentMethods = await db.collection("paymentMethods").find({}).project({ walletName: 1, bankName: 1, referenceId: 1 }).toArray();

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

  if (!usePaging) return enriched;
  return { deposits: enriched, total, page: safePage, limit: safeLimit, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
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

// Single source of truth for the deposits badge: pending requests only.
// { pending, items } where items = up to `limit` most recent pending
// deposits (lightweight summary for the notification dropdown).
// The client never derives this count itself, so SSE/polling/refresh can
// never duplicate or drift it — approve/reject flips status away from
// "pending" and the next read reflects the DB exactly.
export async function getPendingDepositState(limit = 20) {
  const collection = await getDepositsCollection();
  const [pending, total, items] = await Promise.all([
    collection.countDocuments({ status: "pending" }),
    collection.countDocuments({}),
    collection
      .find({ status: "pending" })
      .project({ email: 1, uid: 1, amount: 1, amountBDT: 1, creditedUSD: 1, transactionRef: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),
  ]);
  return { pending, total, items };
}
