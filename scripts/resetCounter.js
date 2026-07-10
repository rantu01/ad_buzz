const { MongoClient } = require("mongodb");

// Inline .env parsing
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "ad_buzz";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const counter = await db.collection("counters").findOne({ _id: "userId" });
  console.log("Current counter:", JSON.stringify(counter));

  // Find the max last4 digits used across all users' customId
  const users = await db.collection("users").find({ customId: { $regex: "^ADB5" } }).project({ customId: 1, _id: 0 }).toArray();
  let maxSeq = 50000; // fallback: ADB50000
  for (const u of users) {
    const match = u.customId.match(/^ADB5(\d{4})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq - 50000) maxSeq = 50000 + num;
    }
  }

  console.log("Detected max last 4 digits:", maxSeq - 50000);

  await db.collection("counters").findOneAndUpdate(
    { _id: "userId" },
    { $set: { seq: maxSeq } },
    { upsert: true }
  );

  const updated = await db.collection("counters").findOne({ _id: "userId" });
  console.log("Updated counter:", JSON.stringify(updated));
  const nextSeq = updated.seq + 1;
  const nextLast4 = String(nextSeq).slice(-4).padStart(4, "0");
  console.log("Next user will get ID: ADB5" + nextLast4);

  await client.close();
}
main().catch(console.error);