import { createHash } from "crypto";

// Pure, dependency-free sync math (no DB, no network). Imported by
// lib/metaSyncState.js (which re-exports them, preserving existing contracts)
// and directly by tests.

// Fields that participate in change detection. Keep in sync with
// fetchPaginated mapping in metaApiService.js.
export const FINGERPRINT_FIELDS = [
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
    // An unreadable Funds sync (null) is not a change when we already hold
    // a real balance — keeps good data from churning or being overwritten.
    if (f === "prepaidBalance" && typeof oldV === "number" && newV == null) continue;
    if (typeof oldV === "number" && typeof newV === "number") {
      if (Math.abs(oldV - newV) < 0.001) continue;
      changes[f] = newV;
      continue;
    }
    if (oldV !== newV) changes[f] = newV;
  }
  return changes;
}

// ---- Rate-limit helpers -----------------------------------------------
// Meta returns usage in `x-app-usage`, `x-ad-account-usage` (JSON with
// call_count / total_cputime / total_time, 0-100 scale) and error 80004 /
// code 613 / 80000-series on throttling.

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
    /rate limit|throttl|too many calls|request limit|code["'\s:]+(613|80004)/i.test(msg)
  );
}

// Runs an async sync pass and ALWAYS invokes reschedule afterwards, even
// when the pass throws. The scheduler chain must never die on a transient
// failure: a single escaped rejection used to stop all future reconciles
// for the life of the process (frozen "Last Refreshed"). Note the error
// still propagates — the caller must catch/log it (see startAutoMetaFetch).
export async function runWithReschedule(passFn, reschedule) {
  try {
    return await passFn();
  } finally {
    reschedule();
  }
}
