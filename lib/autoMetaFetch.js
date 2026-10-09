import { fetchAdAccountsFromBM, fetchSingleAdAccountFromMeta, acquireSyncLock, releaseSyncLock } from "./metaApiService";
import { saveMetaAdAccounts, createSyncLog, getMetaSettings } from "./metaSettingsModel";
import { ensureAdAccountsForMeta } from "./adAccountModel";
import { emitToChannel, emitToAll } from "./sseManager";
import { fingerprintMetaAccount, diffMetaAccount, getSyncState, setSyncState, getBackoffRemainingMs, backoffDelayMs, isRateLimitError } from "./metaSyncState";
import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const AUTO_SYNC_LOCK_NAME = "auto_meta_sync";

// Adaptive reconciliation windows (not aggressive polling):
// - Base full-BM reconciliation: 5 minutes (was ~30-50s full-list fetch).
// - Recently changed accounts: re-check individually after 60s.
// - Stable accounts: only via the base pass.
// - Webhook / priority events: immediate targeted single-account fetch.
const BASE_RECONCILE_MS = 5 * 60 * 1000;
const MAX_RECONCILE_MS = 20 * 60 * 1000;
const PRIORITY_MIN_GAP_MS = 15000;

let initialized = false;
let consecutiveFailures = 0;
let lastFullReconcileAt = 0;
let lastPriorityAt = 0;
let priorityQueue = new Set();
let priorityRunning = false;
let lastRunState = { state: "idle", accountCount: 0, updatedCount: 0, createdCount: 0, deletedCount: 0, lastRunAt: null, lastError: null };

// Never clobber a known-good prepaid Funds value with an unreadable sync.
// When Meta omits funding_source_details (bulk edge gaps, permission
// fallback), incoming prepaid is null — keep the stored number instead of
// wiping real funds back to N/A. Mutates `setObj` in place.
function preserveKnownPrepaid(oldDoc, setObj) {
  if (
    setObj &&
    setObj.prepaidBalance == null &&
    oldDoc &&
    typeof oldDoc.prepaidBalance === "number"
  ) {
    delete setObj.prepaidBalance;
    delete setObj.prepaidBalanceStatus;
  }
  return setObj;
}

function mapMetaStatusToLocal(accountStatus) {
  switch (accountStatus) {
    case 1: return "active";
    case 2: return "disabled";
    case 3:
    case 7:
    case 8:
    case 9: return "paused";
    case 100:
    case 101:
    case 202: return "disabled";
    default: return "unknown";
  }
}

function buildAdAccountPatch(meta, changes) {
  const patch = { lastSyncedAt: new Date(), syncStatus: "synced", syncError: null };
  // Propagate every dashboard-visible Meta field into adAccounts.
  // This is the rename fix: name/metaAccountName/currency/status must
  // follow Meta, never stay frozen at import-time values.
  if ("name" in changes) {
    patch.name = meta.name;
    patch.metaAccountName = meta.name;
  }
  if ("currency" in changes) patch.currency = meta.currency;
  if ("accountStatus" in changes || "disableReason" in changes) {
    patch.status = mapMetaStatusToLocal(meta.accountStatus);
  }
  if ("spendCap" in changes) patch.spendCap = meta.spendCap;
  if ("amountSpent" in changes) patch.spent = meta.amountSpent;
  if ("prepaidBalance" in changes) {
    patch.prepaidBalance = meta.prepaidBalance ?? null;
    patch.prepaidBalanceStatus = meta.prepaidBalanceStatus || "unavailable";
  }
  if ("isPrepayAccount" in changes) patch.isPrepayAccount = meta.isPrepayAccount ?? null;
  return patch;
}

export function getReconcileDelay() {
  if (consecutiveFailures > 0) return backoffDelayMs(consecutiveFailures - 1);
  // Adaptive: shorten the next pass if the last pass found changes
  // (recently active), otherwise drift toward the max window.
  const hadActivity = (lastRunState.updatedCount || 0) + (lastRunState.createdCount || 0) + (lastRunState.deletedCount || 0) > 0;
  const delay = hadActivity ? BASE_RECONCILE_MS / 2 : BASE_RECONCILE_MS;
  return Math.min(delay, MAX_RECONCILE_MS) + Math.random() * 20000;
}

async function applyIncrementalDiff(metaAccounts) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const now = new Date();

  const incomingById = new Map(metaAccounts.map((m) => [m.metaAccountId, m]));
  const existingMeta = await db.collection("metaAdAccounts").find({}).toArray();
  const existingById = new Map(existingMeta.map((m) => [m.metaAccountId, m]));

  const created = [];
  const updated = []; // { metaAccountId, changes, fingerprint }
  for (const m of metaAccounts) {
    const old = existingById.get(m.metaAccountId);
    if (!old) {
      created.push(m);
      continue;
    }
    const changes = diffMetaAccount(old, m);
    if (Object.keys(changes).length > 0) updated.push({ metaAccountId: m.metaAccountId, changes, meta: m });
  }
  const deleted = existingMeta.filter((m) => m.metaAccountId && !incomingById.has(m.metaAccountId));

  // --- Write metaAdAccounts incrementally (only changed docs) ---
  const ops = [];
  for (const m of created) {
    ops.push({
      updateOne: {
        filter: { metaAccountId: m.metaAccountId },
        update: { $set: { ...m, fingerprint: fingerprintMetaAccount(m), importedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    });
  }
  for (const u of updated) {
    const setObj = { ...u.meta, fingerprint: fingerprintMetaAccount(u.meta), importedAt: now };
    // A bulk pass that couldn't read Funds must not erase previously
    // synced balances.
    preserveKnownPrepaid(existingById.get(u.metaAccountId), setObj);
    ops.push({
      updateOne: {
        filter: { metaAccountId: u.metaAccountId },
        update: { $set: setObj },
      },
    });
  }
  for (const d of deleted) {
    ops.push({ deleteOne: { filter: { metaAccountId: d.metaAccountId } } });
  }
  if (ops.length > 0) {
    await db.collection("metaAdAccounts").bulkWrite(ops, { ordered: false });
  }

  // --- Propagate into adAccounts (local source of truth for UI) ---
  const adAccounts = await db.collection("adAccounts").find({
    metaAccountId: { $in: [...incomingById.keys()] },
  }).project({ _id: 1, metaAccountId: 1, uid: 1 }).toArray();
  const adByMetaId = new Map(adAccounts.map((a) => [a.metaAccountId, a]));

  let adUpdated = 0;
  const adBulk = [];
  for (const u of updated) {
    const ad = adByMetaId.get(u.metaAccountId);
    if (!ad) continue;
    adBulk.push({
      updateOne: { filter: { _id: ad._id }, update: { $set: { ...buildAdAccountPatch(u.meta, u.changes), updatedAt: now } } },
    });
    adUpdated++;
  }
  if (adBulk.length > 0) {
    await db.collection("adAccounts").bulkWrite(adBulk, { ordered: false });
  }

  // Materialize brand-new Meta accounts as adAccounts (non-destructive upsert).
  const newCount = await ensureAdAccountsForMeta(created);

  return { created, updated, deleted, adUpdated, newCount };
}

function emitGranularEvents({ created, updated, deleted }) {
  const at = new Date().toISOString();
  for (const m of created) {
    const payload = { event: "ad_account.created", adAccountId: m.metaAccountId, account: m, syncedAt: at };
    emitToChannel("admin:meta", "ad_account.created", payload);
    emitToAll("ad_account.created", payload);
  }
  for (const u of updated) {
    const payload = { event: "ad_account.updated", adAccountId: u.metaAccountId, changes: u.changes, account: u.meta, syncedAt: at };
    emitToChannel("admin:meta", "ad_account.updated", payload);
    emitToAll("ad_account.updated", payload);
    if ("name" in u.changes) {
      console.log(`[meta-sync] account renamed: ${u.metaAccountId} -> "${u.meta.name}"`);
    }
  }
  for (const d of deleted) {
    const payload = { event: "ad_account.deleted", adAccountId: d.metaAccountId, syncedAt: at };
    emitToChannel("admin:meta", "ad_account.deleted", payload);
    emitToAll("ad_account.deleted", payload);
  }
}

async function runFullReconcile(reason = "scheduled") {
  const backoffMs = await getBackoffRemainingMs();
  if (backoffMs > 0) {
    console.log(`[meta-sync] Skipping reconcile (${reason}): Meta backoff ${Math.ceil(backoffMs / 1000)}s remaining.`);
    return { skipped: true, reason: "backoff" };
  }
  const lockAcquired = await acquireSyncLock(AUTO_SYNC_LOCK_NAME, 300);
  if (!lockAcquired) {
    lastRunState.state = "locked";
    return { skipped: true, reason: "locked" };
  }
  const startTime = Date.now();
  try {
    const settings = await getMetaSettings();
    if (!settings?.accessToken || !settings?.businessManagerId) return { skipped: true, reason: "not-configured" };

    console.log(`[meta-sync] Full reconcile started (reason=${reason}).`);
    const accounts = await fetchAdAccountsFromBM();
    const diff = await applyIncrementalDiff(accounts);
    consecutiveFailures = 0;
    lastFullReconcileAt = Date.now();

    const { created, updated, deleted, adUpdated, newCount } = diff;
    await setSyncState("bm_ad_accounts", {
      lastFullReconcileAt: new Date(),
      lastAccountCount: accounts.length,
      lastSyncedAt: new Date(),
    });

    if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
      emitGranularEvents(diff);
      await createSyncLog({
        type: "info",
        message: `[Auto-fetch] Reconciled ${accounts.length} accounts: ${created.length} created, ${updated.length} updated (${adUpdated} adAccounts), ${deleted.length} removed${newCount > 0 ? `, materialized ${newCount} new adAccounts` : ""}`,
      });
      console.log(`[meta-sync] Reconcile done in ${Date.now() - startTime}ms: +${created.length} ~${updated.length} -${deleted.length}.`);
    }

    lastRunState = {
      state: "synced",
      accountCount: accounts.length,
      updatedCount: updated.length,
      createdCount: created.length,
      deletedCount: deleted.length,
      lastRunAt: new Date().toISOString(),
      lastError: null,
    };
    emitToAll("meta-status", { state: "synced", accountCount: accounts.length, ...lastRunState });
    return { skipped: false, ...diff, accountCount: accounts.length, duration: Date.now() - startTime };
  } catch (err) {
    consecutiveFailures++;
    const message = err.message || "Unknown error";
    lastRunState = { ...lastRunState, state: "error", lastError: message, lastRunAt: new Date().toISOString() };
    emitToAll("meta-status", { state: "error", lastError: message });
    if (!isRateLimitError(err)) console.error("[meta-sync] Reconcile error:", message);
    await createSyncLog({ type: "error", message: `[Auto-fetch] Reconcile failed: ${message}` }).catch(() => {});
    return { skipped: true, reason: "error", message };
  } finally {
    await releaseSyncLock(AUTO_SYNC_LOCK_NAME);
  }
}

// Priority path: refresh exactly the given Meta account IDs (webhook /
// manual single refresh). One Graph call per ID, debounced/coalesced.
export function requestPrioritySync(metaAccountIds) {
  const ids = (Array.isArray(metaAccountIds) ? metaAccountIds : [metaAccountIds])
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("act_") ? id : `act_${id.replace(/^act_/, "")}`));
  for (const id of ids) priorityQueue.add(id);
  void drainPriorityQueue();
  return { queued: ids.length };
}

async function drainPriorityQueue() {
  if (priorityRunning) return;
  if (Date.now() - lastPriorityAt < PRIORITY_MIN_GAP_MS) {
    setTimeout(() => { priorityRunning = false; void drainPriorityQueue(); }, PRIORITY_MIN_GAP_MS);
    return;
  }
  priorityRunning = true;
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    while (priorityQueue.size > 0) {
      const backoffMs = await getBackoffRemainingMs();
      if (backoffMs > 0) break;
      const batch = [...priorityQueue].slice(0, 5);
      for (const id of batch) priorityQueue.delete(id);
      for (const metaAccountId of batch) {
        try {
          const fresh = await fetchSingleAdAccountFromMeta(metaAccountId);
          const old = await db.collection("metaAdAccounts").findOne({ metaAccountId: fresh.metaAccountId })
            || await db.collection("metaAdAccounts").findOne({ metaAccountId: metaAccountId });
          const key = fresh.metaAccountId || metaAccountId;
          const changes = old ? diffMetaAccount(old, fresh) : { ...fresh };
          const isNew = !old;
          const setObj = { ...fresh, metaAccountId: key, fingerprint: fingerprintMetaAccount(fresh), importedAt: new Date() };
          // A single refresh that couldn't read Funds must not erase a
          // previously synced balance.
          preserveKnownPrepaid(old, setObj);
          await db.collection("metaAdAccounts").updateOne(
            { metaAccountId: key },
            { $set: setObj, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
          );
          const ad = await db.collection("adAccounts").findOne({ metaAccountId: key });
          if (ad && Object.keys(changes).length > 0) {
            await db.collection("adAccounts").updateOne(
              { _id: ad._id },
              { $set: { ...buildAdAccountPatch(fresh, isNew ? { name: 1, currency: 1, accountStatus: 1, spendCap: 1, amountSpent: 1, prepaidBalance: 1, isPrepayAccount: 1 } : changes), updatedAt: new Date() } }
            );
          } else if (!ad) {
            await ensureAdAccountsForMeta([fresh]);
          }
          const at = new Date().toISOString();
          const payload = isNew
            ? { event: "ad_account.created", adAccountId: key, account: fresh, syncedAt: at }
            : { event: "ad_account.updated", adAccountId: key, changes, account: fresh, syncedAt: at };
          emitToChannel("admin:meta", isNew ? "ad_account.created" : "ad_account.updated", payload);
          emitToAll(isNew ? "ad_account.created" : "ad_account.updated", payload);
          console.log(`[meta-sync] Priority refresh ${isNew ? "created" : "updated"} ${key}${changes?.name ? ` (name -> "${fresh.name}")` : ""}.`);
          lastPriorityAt = Date.now();
        } catch (err) {
          if (!isRateLimitError(err)) console.error(`[meta-sync] Priority refresh failed for ${metaAccountId}:`, err.message);
        }
      }
    }
  } finally {
    priorityRunning = false;
    if (priorityQueue.size > 0) setTimeout(() => void drainPriorityQueue(), PRIORITY_MIN_GAP_MS);
  }
}

export function startAutoMetaFetch() {
  if (initialized) return;
  initialized = true;

  const schedule = () => {
    setTimeout(async () => {
      await runFullReconcile("scheduled");
      schedule();
    }, getReconcileDelay());
  };

  void runFullReconcile("startup");
  schedule();
}

export function getAutoFetchStatus() {
  return { ...lastRunState };
}

export { runFullReconcile };
