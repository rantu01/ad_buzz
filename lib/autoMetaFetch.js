import { fetchAdAccountsFromBM, acquireSyncLock, releaseSyncLock } from "./metaApiService";
import { saveMetaAdAccounts, createSyncLog, getMetaSettings } from "./metaSettingsModel";
import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const AUTO_SYNC_LOCK_NAME = "auto_meta_sync";

let initialized = false;

function getRandomDelay() {
  return 30000 + Math.random() * 20000;
}

async function syncAdAccountChanges(metaAccounts) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const metaByAccountId = {};
  for (const ma of metaAccounts) {
    metaByAccountId[ma.metaAccountId] = ma;
  }

  const adAccounts = await db.collection("adAccounts").find({
    metaAccountId: { $ne: "", $exists: true },
    unassignedAt: null,
  }).toArray();

  let updatedCount = 0;

  for (const adAccount of adAccounts) {
    const meta = metaByAccountId[adAccount.metaAccountId];
    if (!meta) continue;

    const updates = {};

    if (typeof meta.spendCap === "number" && Math.abs(meta.spendCap - (adAccount.spendCap || 0)) > 0.001) {
      updates.spendCap = meta.spendCap;
    }

    if (typeof meta.amountSpent === "number" && Math.abs(meta.amountSpent - (adAccount.spent || 0)) > 0.001) {
      updates.spent = meta.amountSpent;
    }

    if (Object.keys(updates).length > 0) {
      updates.lastSyncedAt = new Date();
      updates.syncStatus = "synced";
      await db.collection("adAccounts").updateOne(
        { _id: adAccount._id },
        { $set: updates }
      );
      updatedCount++;
    }
  }

  return updatedCount;
}

async function runFetch() {
  const lockAcquired = await acquireSyncLock(AUTO_SYNC_LOCK_NAME, 60);
  if (!lockAcquired) return;

  try {
    const settings = await getMetaSettings();
    if (settings?.accessToken && settings?.businessManagerId) {
      const accounts = await fetchAdAccountsFromBM();
      await saveMetaAdAccounts(accounts);

      const updated = await syncAdAccountChanges(accounts);

      if (updated > 0) {
        await createSyncLog({
          type: "info",
          message: `[Auto-fetch] Fetched ${accounts.length} accounts, updated ${updated} ad accounts`,
        });
      }
    }
  } catch (err) {
    console.error("[Auto-fetch] Error:", err.message);
  } finally {
    await releaseSyncLock(AUTO_SYNC_LOCK_NAME);
  }
}

export function startAutoMetaFetch() {
  if (initialized) return;
  initialized = true;

  const schedule = () => {
    setTimeout(async () => {
      await runFetch();
      schedule();
    }, getRandomDelay());
  };

  runFetch();
  schedule();
}
