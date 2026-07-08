import { getMetaSettings, createSyncLog } from "./metaSettingsModel";
import { updateAdAccount, getAllAdAccounts } from "./adAccountModel";
import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

const SYNC_LOCK_NAME = "meta_sync";
const SYNC_LOCK_TTL_SECONDS = 300;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

export async function acquireSyncLock(name = SYNC_LOCK_NAME, ttlSeconds = SYNC_LOCK_TTL_SECONDS) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await db.collection("syncLocks").createIndex({ name: 1 }, { unique: true, background: true }).catch(() => {});

  const result = await db.collection("syncLocks").updateOne(
    { name, locked: { $ne: true } },
    { $set: { locked: true, lockedAt: new Date(), expiresAt: new Date(Date.now() + ttlSeconds * 1000) } },
    { upsert: true }
  );

  if (result.upsertedCount > 0 || result.modifiedCount > 0) {
    return true;
  }

  const existing = await db.collection("syncLocks").findOne({ name });
  if (existing && existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
    await db.collection("syncLocks").updateOne(
      { name },
      { $set: { locked: true, lockedAt: new Date(), expiresAt: new Date(Date.now() + ttlSeconds * 1000) } }
    );
    return true;
  }

  return false;
}

export async function releaseSyncLock(name = SYNC_LOCK_NAME) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("syncLocks").updateOne(
    { name },
    { $set: { locked: false } }
  );
}

async function releaseStaleLocks() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("syncLocks").updateMany(
    { locked: true, expiresAt: { $lt: new Date() } },
    { $set: { locked: false } }
  );
}

async function getAccessToken() {
  const settings = await getMetaSettings();
  if (!settings?.accessToken) {
    throw new Error("Meta API access token not configured. Please configure in Meta API Settings.");
  }
  return settings.accessToken;
}

export async function testConnection() {
  const settings = await getMetaSettings();
  if (!settings?.accessToken) {
    return { success: false, message: "Access token not configured" };
  }
  if (!settings?.businessManagerId) {
    return { success: false, message: "Business Manager ID not configured" };
  }
  const url = `${GRAPH_API_BASE}/${settings.businessManagerId}?fields=id,name&access_token=${settings.accessToken}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      return { success: false, message: data.error.message };
    }
    return { success: true, message: `Connected to BM: ${data.name || data.id}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function fetchPaginated(url) {
  const accounts = [];
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Meta API error: ${data.error.message}`);
    const mapped = (data.data || []).map((acc) => ({
      metaAccountId: acc.id,
      name: acc.name || `Ad Account ${acc.id}`,
      accountStatus: acc.account_status,
      currency: acc.currency || "USD",
      balance: (acc.balance || 0) / 100,
      spendCap: (acc.spend_cap || 0) / 100,
      amountSpent: (acc.amount_spent || 0) / 100,
      disableReason: acc.disable_reason || null,
    }));
    accounts.push(...mapped);
    url = data.paging?.next || null;
  }
  return accounts;
}

export async function fetchAdAccountsFromBM() {
  const settings = await getMetaSettings();
  if (!settings?.businessManagerId) throw new Error("Business Manager ID not configured");
  const token = await getAccessToken();
  const bmId = settings.businessManagerId;

  const fields = "id,name,account_status,currency,balance,spend_cap,amount_spent,disable_reason";

  const [owned, client] = await Promise.all([
    fetchPaginated(`${GRAPH_API_BASE}/${bmId}/owned_ad_accounts?fields=${fields}&limit=100&access_token=${token}`),
    fetchPaginated(`${GRAPH_API_BASE}/${bmId}/client_ad_accounts?fields=${fields}&limit=100&access_token=${token}`),
  ]);

  const seen = new Set();
  return [...owned, ...client].filter((acc) => {
    if (seen.has(acc.metaAccountId)) return false;
    seen.add(acc.metaAccountId);
    return true;
  });
}

export async function fetchAdAccountInsights(metaAccountIdRaw) {
  const token = await getAccessToken();
  const accountId = metaAccountIdRaw.replace("act_", "");
  const url = `${GRAPH_API_BASE}/act_${accountId}/insights?fields=spend,impressions,clicks,cpc,ctr,cpm,cpp&date_preset=this_month&level=account&limit=1&access_token=${token}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API error: ${data.error.message}`);

  if (data.data && data.data.length > 0) {
    const d = data.data[0];
    return {
      spend: parseFloat(d.spend || 0),
      impressions: parseInt(d.impressions || 0),
      clicks: parseInt(d.clicks || 0),
      cpc: parseFloat(d.cpc || 0),
      ctr: parseFloat(d.ctr || 0),
      cpm: parseFloat(d.cpm || 0),
      dateStart: d.date_start,
      dateEnd: d.date_end,
    };
  }
  return { spend: 0, impressions: 0, clicks: 0, cpc: 0, ctr: 0, cpm: 0, dateStart: null, dateEnd: null };
}

export async function updateSpendCap(metaAccountIdRaw, newCapInDollars) {
  const token = await getAccessToken();
  const accountId = metaAccountIdRaw.replace("act_", "");
  const url = `${GRAPH_API_BASE}/act_${accountId}?access_token=${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spend_cap: parseFloat(newCapInDollars || 0) }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API error: ${data.error.message}`);
  return data;
}

export async function syncAllAdAccounts(accountIds) {
  await releaseStaleLocks();

  const lockAcquired = await acquireSyncLock();
  if (!lockAcquired) {
    return { success: false, message: "Sync already running. Please wait.", locked: true };
  }

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    const allAccounts = accountIds && accountIds.length > 0
      ? (await getAllAdAccounts()).filter(a => accountIds.includes(a._id.toString()))
      : await getAllAdAccounts();
    if (allAccounts.length === 0) {
      await createSyncLog({ type: "info", message: "No assigned ad accounts found to sync" });
      return { success: true, synced: 0, errors: 0 };
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const metaAccountsData = await db.collection("metaAdAccounts").find({}).toArray();
    const metaByAccountId = {};
    for (const ma of metaAccountsData) {
      metaByAccountId[ma.metaAccountId] = ma;
    }

    for (const acc of allAccounts) {
      if (!acc.metaAccountId) {
        errorCount++;
        errors.push(`${acc.name || acc.accountId}: No Meta Account ID`);
        continue;
      }

      if (acc.lastSyncedAt && (Date.now() - new Date(acc.lastSyncedAt).getTime()) < SYNC_COOLDOWN_MS) {
        continue;
      }

      try {
        const metaAccount = metaByAccountId[acc.metaAccountId];
        let accountStatus = acc.status;
        if (metaAccount) {
          switch (metaAccount.accountStatus) {
            case 1: accountStatus = "active"; break;
            case 2: accountStatus = "disabled"; break;
            case 3:
            case 7:
            case 8:
            case 9: accountStatus = "paused"; break;
            case 100:
            case 101:
            case 202: accountStatus = "disabled"; break;
            default: accountStatus = "unknown";
          }
        }

        const insights = await fetchAdAccountInsights(acc.metaAccountId);
        const updateData = {
          status: accountStatus,
          spent: insights.spend,
          currency: metaAccount?.currency || acc.currency || "USD",
          lastSyncedAt: new Date(),
          syncStatus: "synced",
          lastInsights: {
            impressions: insights.impressions,
            clicks: insights.clicks,
            cpc: insights.cpc,
            ctr: insights.ctr,
            cpm: insights.cpm,
            dateStart: insights.dateStart,
            dateEnd: insights.dateEnd,
          },
        };

        await updateAdAccount(acc._id.toString(), updateData);
        successCount++;
      } catch (accErr) {
        errorCount++;
        errors.push(`${acc.name || acc.accountId}: ${accErr.message}`);
        await updateAdAccount(acc._id.toString(), {
          syncStatus: "error",
          syncError: accErr.message,
          lastSyncedAt: new Date(),
        });
      }
    }

    const duration = Date.now() - startTime;
    const summary = `Sync completed in ${duration}ms. ${successCount} success, ${errorCount} errors.`;
    await createSyncLog({
      type: errorCount > 0 ? "warning" : "success",
      message: summary,
      details: { successCount, errorCount, errors: errors.slice(0, 10) },
      duration,
    });

    return { success: true, synced: successCount, errors: errorCount, duration };
  } catch (err) {
    await createSyncLog({ type: "error", message: `Sync failed: ${err.message}`, details: { stack: err.stack } });
    return { success: false, message: err.message };
  } finally {
    await releaseSyncLock();
  }
}
