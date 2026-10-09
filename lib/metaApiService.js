import { getMetaSettings, createSyncLog } from "./metaSettingsModel";
import { getAllAdAccounts, getAllAdAccountsForSync, updateAdAccount, updateAdAccountsBatch } from "./adAccountModel";
import { emitToChannel } from "./sseManager";
import { recordRateUsage, recordRateLimitHit, getBackoffRemainingMs, backoffDelayMs, isRateLimitError } from "./metaSyncState";
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

  try {
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
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

export async function releaseSyncLock(name = SYNC_LOCK_NAME) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("syncLocks").updateOne(
    { name },
    { $set: { locked: false } }
  );
}

// Server-side throttle for manual "Refresh" actions so rapid clicks from
// one or many clients collapse into a single Meta sync (per scope).
export async function checkManualThrottle(scope = "manual:global", windowMs = 60000) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const now = new Date();
  const doc = await db.collection("syncLocks").findOne({ name: scope });
  if (doc?.throttledUntil && new Date(doc.throttledUntil) > now) {
    const waitSec = Math.ceil((new Date(doc.throttledUntil).getTime() - now.getTime()) / 1000);
    return { throttled: true, waitSec };
  }
  await db.collection("syncLocks").updateOne(
    { name: scope },
    { $set: { throttledUntil: new Date(Date.now() + windowMs) } },
    { upsert: true }
  );
  return { throttled: false, waitSec: 0 };
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

// Meta field sets. NOTE on prepaid Funds mapping (Payment & Billing → Funds):
// - Top-level `balance` is documented by Meta as "Bill amount due", NOT the
//   prepaid "Available funds" shown in the Billing UI (community-confirmed
//   mismatch). The Funds value lives in `funding_source_details` (requires
//   MANAGE task permission on the ad account; STORED_BALANCE type = 20).
// - `funding_source_details` needs a fallback: tokens without MANAGE
//   permission fail the whole request, so on a field-level error we retry
//   with BASE fields and record prepaid as unavailable (never fake $0).
const META_ACCOUNT_BASE_FIELDS = "id,name,account_status,currency,balance,spend_cap,amount_spent,disable_reason";
const META_ACCOUNT_PREPAID_FIELDS = "funding_source_details,is_prepay_account";
const META_ACCOUNT_FIELDS = `${META_ACCOUNT_BASE_FIELDS},${META_ACCOUNT_PREPAID_FIELDS}`;

// Defensive parser for `funding_source_details` (shape varies by account /
// permission; Meta does not document a single balance sub-field). Returns
// { value: number|null, status: "available"|"unavailable", raw: string|null }.
// Monetary convention follows the rest of the Graph API: integer values are
// minor currency units (÷100); decimal strings are major units as-is.
export function parsePrepaidBalance(fundingSourceDetails) {
  if (fundingSourceDetails == null) return { value: null, status: "unavailable", raw: null };
  const d = fundingSourceDetails;
  const toDollars = (raw) => {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return null;
      return Number.isInteger(raw) ? raw / 100 : raw;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return null;
      // Decimal string ("70.25") = major units; integer string = minor units.
      return /[.,]/.test(trimmed) ? n : n / 100;
    }
    return null;
  };
  // Direct scalar (some API versions return the balance scalar here).
  if (typeof d === "number" || typeof d === "string") {
    const v = toDollars(d);
    return v == null ? { value: null, status: "unavailable", raw: String(d).slice(0, 200) } : { value: v, status: "available", raw: null };
  }
  if (Array.isArray(d)) {
    for (const item of d) {
      const parsed = parsePrepaidBalance(item);
      if (parsed.status === "available") return parsed;
    }
    return { value: null, status: "unavailable", raw: JSON.stringify(d).slice(0, 500) };
  }
  if (typeof d === "object") {
    const candidates = [
      d.balance, d.amount, d.funds, d.available_funds, d.availableFunds,
      d.prepaid_balance, d.prepaidBalance, d.stored_balance, d.storedBalance,
      d.current_balance, d.currentBalance,
    ];
    for (const c of candidates) {
      const v = toDollars(c);
      if (v != null) return { value: v, status: "available", raw: null };
    }
    // Live API shape (v22.0, verified): stored-balance funds arrive as
    // { id, display_string: "Available balance ($1.92 USD)", type: 20 }
    // with no separate numeric field — extract the amount from the string.
    // Display strings are major currency units ("1.92" = $1.92).
    // Guard: ONLY parse funds-type strings (type 20 / STORED_BALANCE or
    // balance|funds|available wording). A card source like
    // { display_string: "VISA *4226", type: 1 } must NEVER parse as $4,226.
    if (typeof d.display_string === "string") {
      const looksLikeFunds =
        d.type === 20 ||
        /balance|funds|available|prepaid|stored/i.test(d.display_string);
      if (looksLikeFunds) {
        const m = d.display_string.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
        if (m) {
          const n = Number(m[1].replace(/,/g, ""));
          if (Number.isFinite(n)) return { value: n, status: "available", raw: null };
        }
      }
    }
    // Nested funding_source object variant.
    if (d.funding_source && typeof d.funding_source === "object") {
      const nested = parsePrepaidBalance(d.funding_source);
      if (nested.status === "available") return nested;
    }
    if (Array.isArray(d.data)) {
      for (const item of d.data) {
        const parsed = parsePrepaidBalance(item);
        if (parsed.status === "available") return parsed;
      }
    }
    return { value: null, status: "unavailable", raw: JSON.stringify(d).slice(0, 500) };
  }
  return { value: null, status: "unavailable", raw: null };
}

function mapMetaAccount(acc) {
  const prepaid = parsePrepaidBalance(acc.funding_source_details);
  if (prepaid.raw) {
    console.log(`[meta-sync] Unparseable funding_source_details for ${acc.id}: ${prepaid.raw}`);
  }
  return {
    metaAccountId: acc.id,
    name: acc.name || `Ad Account ${acc.id}`,
    accountStatus: acc.account_status,
    currency: acc.currency || "USD",
    balance: (acc.balance || 0) / 100,
    spendCap: (acc.spend_cap || 0) / 100,
    amountSpent: (acc.amount_spent || 0) / 100,
    disableReason: acc.disable_reason || null,
    // Prepaid "Funds" (Payment & Billing → Funds). null = unavailable
    // (no permission / non-prepay account / field absent) — never fake $0.
    prepaidBalance: prepaid.value,
    prepaidBalanceStatus: prepaid.status,
    isPrepayAccount: typeof acc.is_prepay_account === "boolean" ? acc.is_prepay_account : null,
  };
}

function isFieldPermissionError(data) {
  const msg = String(data?.error?.message || "");
  return /funding_source_details|is_prepay_account|unknown field|invalid field|permission|(#100)|(#200)/i.test(msg);
}

async function fetchPaginated(url, { onRateUsage } = {}) {
  const accounts = [];
  let prepaidFallback = false;
  while (url) {
    // Respect Meta backoff signalled via usage headers / prior 429s.
    const backoffMs = await getBackoffRemainingMs();
    if (backoffMs > 0) {
      throw Object.assign(new Error(`Meta API backoff active. Retry in ${Math.ceil(backoffMs / 1000)}s.`), { code: "META_BACKOFF", retryAfterMs: backoffMs });
    }
    const res = await fetch(url);
    await recordRateUsage(res.headers).catch(() => 0);
    onRateUsage?.(res);
    const data = await res.json();
    if (data.error) {
      // Fallback: token without MANAGE permission (or API version without
      // the field) rejects funding_source_details — retry with base fields
      // so balances/spend still sync and prepaid stays honestly unavailable.
      if (!prepaidFallback && isFieldPermissionError(data)) {
        console.warn(`[meta-sync] Prepaid fields rejected (${data.error.message}). Retrying with base fields; prepaidBalance will be unavailable.`);
        prepaidFallback = true;
        url = url.replace(META_ACCOUNT_FIELDS, META_ACCOUNT_BASE_FIELDS);
        continue;
      }
      if (isRateLimitError({ ...data.error, message: data.error.message })) {
        await recordRateLimitHit();
      }
      throw Object.assign(new Error(`Meta API error: ${data.error.message}`), { code: data.error.code });
    }
    const mapped = (data.data || []).map(mapMetaAccount);
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

  const [owned, client] = await Promise.all([
    fetchPaginated(`${GRAPH_API_BASE}/${bmId}/owned_ad_accounts?fields=${META_ACCOUNT_FIELDS}&limit=100&access_token=${token}`),
    fetchPaginated(`${GRAPH_API_BASE}/${bmId}/client_ad_accounts?fields=${META_ACCOUNT_FIELDS}&limit=100&access_token=${token}`),
  ]);

  const seen = new Set();
  return [...owned, ...client].filter((acc) => {
    if (seen.has(acc.metaAccountId)) return false;
    seen.add(acc.metaAccountId);
    return true;
  });
}

// Targeted fetch for exactly one ad account (webhook / priority path).
// Requests only the fields the dashboard displays; never the full BM list.
export async function fetchSingleAdAccountFromMeta(metaAccountIdRaw, attempt = 0) {
  const backoffMs = await getBackoffRemainingMs();
  if (backoffMs > 0) {
    throw Object.assign(new Error(`Meta API backoff active. Retry in ${Math.ceil(backoffMs / 1000)}s.`), { code: "META_BACKOFF", retryAfterMs: backoffMs });
  }
  const token = await getAccessToken();
  const accountId = String(metaAccountIdRaw || "").replace(/^act_/, "");
  if (!accountId) throw new Error("metaAccountId required");
  const tryFetch = async (fields) => {
    const url = `${GRAPH_API_BASE}/act_${accountId}?fields=${fields}&access_token=${token}`;
    const res = await fetch(url);
    await recordRateUsage(res.headers).catch(() => 0);
    return res.json();
  };
  try {
    let data = await tryFetch(META_ACCOUNT_FIELDS);
    if (data.error && isFieldPermissionError(data)) {
      console.warn(`[meta-sync] Prepaid fields rejected for act_${accountId} (${data.error.message}). Retrying with base fields.`);
      data = await tryFetch(META_ACCOUNT_BASE_FIELDS);
    }
    if (data.error) {
      if (isRateLimitError({ ...data.error, message: data.error.message })) {
        await recordRateLimitHit();
      }
      throw Object.assign(new Error(`Meta API error: ${data.error.message}`), { code: data.error.code });
    }
    const prepaid = parsePrepaidBalance(data.funding_source_details);
    return {
      metaAccountId: data.id?.startsWith("act_") ? data.id : `act_${data.id || accountId}`,
      name: data.name || `Ad Account ${accountId}`,
      accountStatus: data.account_status,
      currency: data.currency || "USD",
      balance: (data.balance || 0) / 100,
      spendCap: (data.spend_cap || 0) / 100,
      amountSpent: (data.amount_spent || 0) / 100,
      disableReason: data.disable_reason || null,
      prepaidBalance: prepaid.value,
      prepaidBalanceStatus: prepaid.status,
      isPrepayAccount: typeof data.is_prepay_account === "boolean" ? data.is_prepay_account : null,
    };
  } catch (err) {
    if (err?.code !== "META_BACKOFF" && attempt < 3 && !isRateLimitError(err)) {
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
      return fetchSingleAdAccountFromMeta(metaAccountIdRaw, attempt + 1);
    }
    throw err;
  }
}

export async function fetchAdAccountInsights(metaAccountIdRaw) {
  const token = await getAccessToken();
  const accountId = metaAccountIdRaw.replace("act_", "");
  const url = `${GRAPH_API_BASE}/act_${accountId}/insights?fields=spend,impressions,clicks,cpc,ctr,cpm,cpp&date_preset=this_month&level=account&limit=1&access_token=${token}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 613) {
      await new Promise((r) => setTimeout(r, 60000));
    }
    throw new Error(`Meta API error: ${data.error.message}`);
  }

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
      : await getAllAdAccountsForSync();
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

    const successfulUpdates = [];

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
        successfulUpdates.push({
          id: acc._id.toString(),
          updates: {
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
          },
        });
      } catch (accErr) {
        errorCount++;
        errors.push(`${acc.name || acc.accountId}: ${accErr.message}`);
        console.warn(`[meta-sync] Account sync failed (${acc.metaAccountId || acc.accountId}): ${accErr.message}`);
        successfulUpdates.push({
          id: acc._id.toString(),
          updates: {
            syncStatus: "error",
            syncError: accErr.message,
            lastSyncedAt: new Date(),
          },
        });
      }
    }

    await updateAdAccountsBatch(successfulUpdates);
    successCount = successfulUpdates.length - errorCount;

    emitToChannel("admin:meta", "sync", { state: "done", successCount, errorCount });

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
