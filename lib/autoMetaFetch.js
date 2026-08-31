import { fetchAdAccountsFromBM, acquireSyncLock, releaseSyncLock } from "./metaApiService";
import { saveMetaAdAccounts, createSyncLog, getMetaSettings } from "./metaSettingsModel";
import { emitToChannel, emitToAll } from "./sseManager";
import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const AUTO_SYNC_LOCK_NAME = "auto_meta_sync";

const MIN_DELAY_MS = 30000;
const MAX_DELAY_MS = 20 * 60 * 1000;

let initialized = false;

function getRandomDelay(retryStreak = 0) {
  if (retryStreak > 3) {
    return Math.min(MAX_DELAY_MS, MIN_DELAY_MS * Math.pow(2, retryStreak - 3)) + Math.random() * 20000;
  }
  return MIN_DELAY_MS + Math.random() * 20000;
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
  }).project({ _id: 1, metaAccountId: 1, spendCap: 1, spent: 1, lastSyncedAt: 1 }).toArray();

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

let consecutiveFailures = 0;
let lastRunState = { state: "idle", accountCount: 0, updatedCount: 0, lastRunAt: null, lastError: null };

async function runFetch() {
  const lockAcquired = await acquireSyncLock(AUTO_SYNC_LOCK_NAME, 60);
  if (!lockAcquired) {
    lastRunState.state = "locked";
    return;
  }

  try {
    const settings = await getMetaSettings();
    if (settings?.accessToken && settings?.businessManagerId) {
      const accounts = await fetchAdAccountsFromBM();
      await saveMetaAdAccounts(accounts);

      const updated = await syncAdAccountChanges(accounts);
      consecutiveFailures = 0;

      if (updated > 0) {
        await createSyncLog({
          type: "info",
          message: `[Auto-fetch] Fetched ${accounts.length} accounts, updated ${updated} ad accounts`,
        });
        emitToChannel("admin:meta", "meta", { accountCount: accounts.length, updated });
        emitToChannel("admin:meta", "sync", { state: "synced", accountCount: accounts.length, updated });
      }

      lastRunState = {
        state: "synced",
        accountCount: accounts.length,
        updatedCount: updated,
        lastRunAt: new Date().toISOString(),
        lastError: null,
      };

      emitToAll("meta-status", { state: "synced", accountCount: accounts.length, updatedCount: updated, lastRunAt: lastRunState.lastRunAt });
    }
  } catch (err) {
    consecutiveFailures++;
    const message = err.message || "Unknown error";
    lastRunState = { ...lastRunState, state: "error", lastError: message, lastRunAt: new Date().toISOString() };
    emitToAll("meta-status", { state: "error", lastError: message });
    console.error("[Auto-fetch] Error:", message);
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
    }, getRandomDelay(consecutiveFailures));
  };

  runFetch();
  schedule();
}

export function getAutoFetchStatus() {
  return { ...lastRunState };
}
