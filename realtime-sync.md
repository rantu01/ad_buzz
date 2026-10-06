# Realtime Meta Sync — Architecture

## Problem

Renames (and other metadata changes) made in Meta Business Manager did not
appear on the dashboard. Root cause: the auto-fetch copied only
`spendCap`/`spent` into `adAccounts`; `name`/`status`/`currency` were frozen
at import time, and the UI polled the full list every 30s.

## Architecture

```
Meta Business Manager / Graph API v22.0
        │  (2 calls per reconcile: owned + client ad_accounts)
        │  (1 call per targeted refresh: /act_<id>)
        ▼
Webhook receiver (/api/meta/webhook) ──► priority queue (coalesced, 15s gap)
Full reconciler (adaptive 2.5–20 min) ──► incremental diff (fingerprint)
        │  rate limiter (x-app-usage, backoffUntil, locks, throttle)
        ▼
MongoDB (metaAdAccounts + adAccounts — latest synced Meta state)
        │  granular change events
        ▼
SSE (/api/events — channels: admin:meta + per-event names)
        ▼
Next.js UI (row-level setQueryData patches, no full refetch)
```

## Meta API endpoints used

- `GET /{bmId}/owned_ad_accounts?fields=id,name,account_status,currency,balance,spend_cap,amount_spent,disable_reason`
- `GET /{bmId}/client_ad_accounts` (same fields)
- `GET /act_{id}?fields=…` (targeted refresh only)
- `GET /act_{id}/insights` (existing spend sync, unchanged)
- `POST /act_{id}` `{spend_cap}` (existing top-up, unchanged)

## Webhook events used

`ad_account` object fields (current Meta docs): `effective_status`,
`subscriptions`, `creative_fatigue`, `ad_recommendations`,
`in_process_ad_objects`, `with_issues_ad_objects`, `product_set_issue`.
**Not supported by Meta (no webhook exists):** ad-account rename,
status/spend-cap metadata change, BM account add/remove. These are covered
by incremental reconciliation + fingerprint diff.

## Sync strategy

- Fingerprint (SHA-256) over name, accountStatus, currency, balance,
  spendCap, amountSpent, disableReason; bulk-write only changed docs.
- New accounts upserted non-destructively (`ensureAdAccountsForMeta`);
  removed accounts deleted from `metaAdAccounts` and emitted as deleted.
- Webhook hit → `requestPrioritySync([ids])` (single-account fetch).
- Base reconcile 5 min; 2.5 min after active passes; up to 20 min when
  stable; exponential backoff on errors; full skip while `backoffUntil`.
- `syncAllAdAccounts` (insights/spend path) unchanged except rate-usage
  recording; per-account 5-min cooldown kept.

## MongoDB

- `metaAdAccounts`: raw Meta state + `fingerprint` + `importedAt`.
- `adAccounts`: UI source of truth; `name`/`metaAccountName`/`currency`/
  `status`/`spendCap`/`spent` follow Meta on every detected change.
- `metaSyncState` (`_id: "bm_ad_accounts"`): last reconcile, usage %, backoff.
- `webhookEvents` (`_id` = dedupe key, TTL 24h): idempotent processing.
- `syncLocks`: existing mutexes + `manual:*` throttle timestamps.

## SSE events

- `ad_account.updated` — `{event, adAccountId, changes, account, syncedAt}`
- `ad_account.created` — `{event, adAccountId, account, syncedAt}`
- `ad_account.deleted` — `{event, adAccountId, syncedAt}`
- Legacy `sync` / `meta` / `ad-account` / `meta-status` kept for back-compat.

## Rate-limit protection

Single shared server-side sync (clients never call Meta); locks;
60s manual throttle (429); priority queue coalescing + batching;
required-fields-only + correct pagination; usage-header pre-emptive
backoff (≥75%); no blind retry on 429/613; per-account insights cooldown.

## Retry / failure handling

Failures keep last good MongoDB data, log to `syncLogs`, and retry with
exponential backoff (30s → 10 min cap + jitter). Rate-limit errors set
`backoffUntil` instead of retrying.

## Cache invalidation

Row patches apply directly from SSE payloads (no TTL wait). Generic events
fall back to React Query invalidation. Query `staleTime` 30s / `gcTime`
5 min unchanged.

## Environment variables

| Var | Purpose |
|---|---|
| `MONGODB_URI` / `MONGODB_DB_NAME` | existing, unchanged |
| `CRON_SECRET` | existing cron guard, unchanged |
| `META_WEBHOOK_VERIFY_TOKEN` | **new** — must match the verify token entered in Meta App Dashboard |
| `META_APP_SECRET` | **new** (optional if stored in settings) — Meta App Secret for `X-Hub-Signature-256` verification |

`metaSettings` may also hold `appSecret` (set via Meta API Settings page;
only `hasAppSecret` is ever returned to clients).

## Webhook setup (Meta App Dashboard → Webhooks → ad_account)

1. Callback URL: `https://<your-domain>/api/meta/webhook` (must be HTTPS).
2. Verify token: the same value as `META_WEBHOOK_VERIFY_TOKEN`.
3. Subscribe fields: `effective_status` (+ any issue fields you want).
4. Per ad account: `POST /act_<id>/subscribed_apps` with an admin/system-user
   token that has `ads_management` (connects delivery to your callback).
5. Test: `GET /api/meta/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=123`
   should return `123`.

## Manual refresh

- Admin ad-accounts “Sync Spend”: client 5-min guard + server 60s throttle.
- Meta settings “Fetch from Meta BM”: shared incremental reconcile, 60s throttle.
- New `refresh-account` action (`{action:"refresh-account", metaAccountId}`):
  30s throttle, targeted single-account fetch.

## Testing

1. Rename an account in BM → row updates live, no reload.
2. Add an account in BM → appears at next reconcile (≤5 min) without reload.
3. Remove an account → row disappears at next reconcile.
4. Open two tabs → one backend sync updates both.
5. Rapid refresh clicks → 429 `throttled` with `waitSec`, single Meta call.
6. Revoke token temporarily → UI keeps last good data + error in sync logs.
7. DevTools → Network: no access token in any client payload.

## Known Meta limitations

- No webhook for rename/metadata/BM membership — detection latency for
  those is bounded by the reconcile interval (2.5–5 min typical), which is
  the fastest Meta's API allows without wasteful high-frequency polling.
- `balance`/`spend_cap` are cent-precision integers in the API (÷100 locally).
- Insights (`spend/impressions/…`) remain on the separate spend-sync path.
