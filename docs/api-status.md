# API Status — Meta Sync & Realtime Delivery

Last updated: 2026-10-12. Covers the centralized Meta synchronization service,
SSE delivery, and the health endpoint. See `realtime-sync.md` for architecture
and `progress.md` for change history.

## Meta Graph API (v22.0, server-side only)

| Endpoint | Used for | Status |
|---|---|---|
| `GET /{bmId}/owned_ad_accounts?fields=id,name,account_status,currency,balance,spend_cap,amount_spent,disable_reason,funding_source_details,is_prepay_account` | Full reconcile (base 5 min, adaptive 2.5–20 min) | ✅ Working |
| `GET /{bmId}/client_ad_accounts` (same fields) | Full reconcile | ✅ Working |
| `GET /act_{id}?fields=…` (same fields) | Targeted refresh: webhook + manual `refresh-account` (≤5/batch, 15 s gap) | ✅ Working |
| `GET /act_{id}/insights?fields=spend,impressions,clicks,cpc,ctr,cpm` | Spend sync (`sync-spend`, per-account 5-min cooldown) | ✅ Working |
| `POST /act_{id} {spend_cap}` | Top-up (writes through, then targeted refresh) | ✅ Working, needs System User **Manage Ad Account** assignment per ad account (see `Setup.md`) |
| `ad_account` webhooks (`effective_status`, issue fields) | Best-effort delivery trigger → targeted refresh | ⚠️ Config required (callback URL + verify token + `subscribed_apps` per account) |

### Known Meta limitations (do not work around client-side)

- No webhook exists for rename, status/spend-cap metadata change, or BM
  add/remove. Detection latency for those = reconcile interval (2.5–5 min).
- `amount_spent` freshness is bounded by Meta's own data availability; the
  `lastSyncedAt` timestamp reflects the latest successful Graph API response,
  never page-cache time.
- Top-level `balance` = amount due (billing), NOT remaining spend cap.
  Remaining Balance is always `spend_cap − amount_spent` (`lib/accountMath.js`).
- Prepaid Funds comes from `funding_source_details` (needs MANAGE task
  permission); without it the value is `null`/`unavailable`, never `$0`.

## Backend routes

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/admin/meta-api/sync?type=meta-accounts` | Cached Meta snapshot list | Unchanged |
| `GET /api/admin/meta-api/sync?type=logs` | Sync logs | Unchanged |
| `GET /api/admin/meta-api/sync?type=status` | **New.** Health snapshot: auto-fetch state, last reconcile, usage %, `backoffUntil`, SSE connection/subscriber counts | Metadata only — no tokens, no account data |
| `POST /api/admin/meta-api/sync` `fetch-accounts` | Shared incremental reconcile | 60 s server throttle (429 + `waitSec`) |
| `POST /api/admin/meta-api/sync` `refresh-account {metaAccountId}` | Targeted single-account refresh | 30 s throttle |
| `POST /api/admin/meta-api/sync` `sync-spend` | Insights spend sync | 60 s throttle; failures set `syncStatus:error` + `lastAttemptedSyncAt` and do **not** advance `lastSyncedAt` |
| `GET/POST /api/meta/webhook` | Verification challenge + HMAC-signed event receiver | `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` (or `metaSettings.appSecret`); 24 h idempotency dedupe |
| `GET /api/events?uid=&channel=` | Authenticated SSE stream | Staff uids auto-subscribed to `admin:meta`; customers receive only their assigned accounts via targeted delivery; status-only events broadcast |
| `POST /api/cron/meta-fetch` | External cron trigger (Bearer `CRON_SECRET`) | Lock-protected, backoff-aware |

## Environment variables

| Var | Purpose |
|---|---|
| `META_FETCH_TIMEOUT_MS` | Per-request timeout for every Meta Graph fetch (default 30000, max 300000). Prevents a hung socket from wedging the sync loop. |
| `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` | Webhook verification (existing). |

## Freshness semantics

- `lastSyncedAt` = last **successful** sync (failures never advance it).
- `lastAttemptedSyncAt` = last attempt, success or failure (spend-sync path).
- `metaAdAccounts.importedAt` = last successful snapshot write per Meta row.
- An SSE event arriving is delivery, not a fresh Meta fetch — row patches
  carry `syncedAt` from the persistence operation.
- Missing source values render as `N/A` (`remainingBalanceSource:
  "unavailable"`), never as `$0`.

## Verification log

| Check | Result |
|---|---|
| `npm test` (27 unit tests: balance math, fingerprint/diff, rate-limit helpers, prepaid parser, webhook auth) | ✅ Pass (2026-10-12) |
| `npx eslint` on all touched files | ✅ Clean (2026-10-12) |
| `npm run build` (webpack, 72 routes incl. `/api/meta/webhook`, `/api/events`) | ✅ Pass (2026-10-12) |
| Live Meta rename/add/remove propagation | ⬜ Requires staging BM + webhook subscription; manual checklist in `realtime-sync.md` → Testing |
