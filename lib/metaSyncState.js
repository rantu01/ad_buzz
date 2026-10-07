import { createHash } from "crypto";
import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

// Fields that participate in change detection. Keep in sync with
// fetchPaginated mapping in metaApiService.js.
const FINGERPRINT_FIELDS = [
  "name",
  "accountStatus",
  "currency",
  "balance",
  "spendCap",
  "amountSpent",
  "disableReason",
  "prepaidBalance",
  "isPrepayAccount",
];

export function fingerprintMetaAccount(acc) {
  const normalized = {};
  for (const f of FINGERPRINT_FIELDS) {
    let v = acc?.[f];
    if (typeof v === "number") v = Math.round(v * 100) / 100;
    if (v === undefined) v = null;
    normalized[f] = v;
  }
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 32);
}

export function diffMetaAccount(oldDoc, incoming) {
  const changes = {};
  for (const f of FINGERPRINT_FIELDS) {
    const oldV = oldDoc?.[f] ?? null;
    let newV = incoming?.[f] ?? null;
    if (typeof oldV === "number" && typeof newV === "number") {
      if (Math.abs(oldV - newV) < 0.001) continue;
      changes[f] = newV;
      continue;
    }
    if (oldV !== newV) changes[f] = newV;
  }
  return changes;
}

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

export function parseUsageHeader(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function usagePct(usage) {
  if (!usage) return 0;
  const nums = [usage.call_count, usage.total_cputime, usage.total_time]
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 0;
}

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

export function backoffDelayMs(attempt) {
  // 30s, 60s, 120s, 240s ... capped at 10 min, plus small jitter.
  const base = 30000 * Math.pow(2, Math.min(Math.max(attempt, 0), 5));
  return Math.min(base, 10 * 60 * 1000) + Math.random() * 5000;
}

export function isRateLimitError(err) {
  const msg = String(err?.message || "");
  const code = err?.code ?? err?.metaCode;
  return (
    code === 613 ||
    code === 80004 ||
    code === 80000 ||
    /rate limit|throttl|too many calls|request limit|code[\"'\s:]+(613|80004)/i.test(msg)
  );
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
