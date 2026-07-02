import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "adBuzz";

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

async function getUsersCollection() {
  const db = await getDb();
  return db.collection("users");
}

export async function getUserByUid(uid) {
  if (!uid) return null;

  const collection = await getUsersCollection();
  return collection.findOne({ uid }, { projection: { password: 0 } });
}

export async function updateUserByUid(uid, updates) {
  if (!uid) return null;

  const collection = await getUsersCollection();
  await collection.updateOne(
    { uid },
    {
      $set: {
        ...updates,
        updatedAt: new Date(),
      },
    }
  );

  return getUserByUid(uid);
}

export async function syncAuthenticatedUser({ uid, email, displayName = "", phoneNumber = "" }) {
  if (!uid || !email) {
    throw new Error("uid and email are required.");
  }

  const db = await getDb();
  const usersCollection = db.collection("users");
  const existingUser = await usersCollection.findOne({ uid });
  const now = new Date();

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  await usersCollection.updateOne(
    { uid },
    {
      $set: {
        email: normalizedEmail,
        displayName: displayName || "",
        phoneNumber: phoneNumber || "",
        accountStatus: existingUser?.accountStatus || "active",
        lastLoginAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        role: "customer",
        availableBalance: 0,
        totalEarned: 0,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return getUserByUid(uid);
}

export async function creditUserBalance(uid, amount) {
  const collection = await getUsersCollection();
  const numericAmount = Number(amount || 0);

  const result = await collection.findOneAndUpdate(
    { uid },
    {
      $inc: {
        availableBalance: numericAmount,
        totalEarned: numericAmount > 0 ? numericAmount : 0,
      },
      $set: {
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  return result.value;
}

export async function debitUserBalance(uid, amount) {
  return creditUserBalance(uid, -Math.abs(Number(amount || 0)));
}

export function canUserWithdraw(user) {
  if (!user) return false;
  if (user.accountStatus === "frozen") return false;
  return true;
}
