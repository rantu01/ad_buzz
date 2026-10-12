import clientPromise from "./mongodb";
import {
  FINGERPRINT_FIELDS,
  fingerprintMetaAccount,
  diffMetaAccount,
  parseUsageHeader,
  usagePct,
  backoffDelayMs,
  isRateLimitError,
  runWithReschedule,
} from "./syncMath";

// Re-export pure helpers so existing import sites (`./metaSyncState`) keep
// working unchanged; tests import them from `./syncMath` directly.
export {
  FINGERPRINT_FIELDS,
  fingerprintMetaAccount,
  diffMetaAccount,
  parseUsageHeader,
  usagePct,
  backoffDelayMs,
  isRateLimitError,
  runWithReschedule,
};

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function getSyncState(key = "bm_ad_accounts") {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  return db.collection("metaSyncState").findOne({ _id: key });
}

export async function setSyncState(key, patch) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await db.collection("metaSyncState").updateOne(
    { _id: key },
    { $set: { ...patch, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

// ---- Rate-limit tracking -----------------------------------------------
// Meta returns usage in `x-app-usage`, `x-ad-account-usage` (JSON with
// call_count / total_cputime / total_time, 0-100 scale) and error 80004 /
// code 613 / 80000-series on throttling. We store the last seen usage and
// a backoff-until timestamp in metaSyncState so every sync path can check
// before issuing Graph API calls.

export async function recordRateUsage(headers, key = "bm_ad_accounts") {
  try {
    const appUsage = parseUsageHeader(headers?.get?.("x-app-usage"));
    const acctUsage = parseUsageHeader(headers?.get?.("x-ad-account-usage"));
    const pct = Math.max(usagePct(appUsage), usagePct(acctUsage));
    const patch = { lastAppUsage: appUsage, lastAdAccountUsage: acctUsage, lastUsagePct: pct };
    // Pre-emptive backoff when Meta reports >75% usage.
    if (pct >= 75) {
      const backoffMs = pct >= 90 ? 10 * 60 * 1000 : 2 * 60 * 1000;
      patch.backoffUntil = new Date(Date.now() + backoffMs);
      console.warn(`[meta-sync] High Meta API usage (${pct}%). Backing off for ${backoffMs / 60000} min.`);
    }
    await setSyncState(key, patch);
    return pct;
  } catch {
    return 0;
  }
}

export async function recordRateLimitHit(key = "bm_ad_accounts", retryAfterMs = 60000) {
  const delay = Math.min(Math.max(retryAfterMs, 60000), 30 * 60 * 1000);
  await setSyncState(key, {
    backoffUntil: new Date(Date.now() + delay),
    lastRateLimitAt: new Date(),
  });
  console.warn(`[meta-sync] Rate limit hit. Backing off for ${Math.round(delay / 1000)}s.`);
}

export async function getBackoffRemainingMs(key = "bm_ad_accounts") {
  const state = await getSyncState(key);
  if (!state?.backoffUntil) return 0;
  return Math.max(0, new Date(state.backoffUntil).getTime() - Date.now());
}

// ---- Webhook event dedupe (idempotent processing) -----------------------

export async function isDuplicateWebhookEvent(dedupeKey, ttlHours = 24) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  try {
    await db.collection("webhookEvents").insertOne({
      _id: dedupeKey,
      receivedAt: new Date(),
      expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
    });
    return false;
  } catch (err) {
    if (err?.code === 11000) return true;
    throw err;
  }
}
