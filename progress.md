# Progress — Near-Real-Time Meta Ad Account Sync

## 1. Audit findings (why Meta changes appeared late)

- `lib/autoMetaFetch.js` ran a **full BM list fetch every ~30–50s**
  (`owned_ad_accounts` + `client_ad_accounts`, 2 paginated Graph calls), but
  `syncAdAccountChanges()` only copied `spendCap` and `spent` into the
  `adAccounts` collection. **`name`, `metaAccountName`, `currency`, and
  `status` were never propagated**, so a rename in Business Manager stayed
  stale in the UI indefinitely. Root cause of the reported bug.
- `lib/metaApiService.js` `syncAllAdAccounts()` read the cached
  `metaAdAccounts` + per-account `insights` (one Graph call **per account**),
  but never re-fetched account metadata either.
- Frontend (`ad-accounts-topup`, user `ad-account`) used
  `refetchInterval: 30000` full-list polling, and SSE handlers called
  `invalidateQueries` (full list refetch). No row-level updates.
- `app/api/meta/webhook` did not exist; no webhook receiver at all.
- `app/api/events/route.js` never subscribed clients to the `channel=`
  query param (only `registerClient`), so `emitToChannel("admin:meta", …)`
  reached nobody unless manually subscribed.
- No rate-limit header handling (`x-app-usage` / `x-ad-account-usage`),
  no backoff on 429/613, per-account 5-min cooldown only.

## 2. Meta webhook reality check (current official docs)

`ad_account` webhooks support **only** delivery/issue-type fields:
`effective_status`, `subscriptions`, `creative_fatigue`,
`ad_recommendations`, `in_process_ad_objects`, `with_issues_ad_objects`,
`product_set_issue`. **There is NO webhook for ad-account rename, status /
spend-cap metadata change, or BM add/remove.** Therefore webhooks are
implemented as best-effort delivery triggers (targeted refresh), while
rename/add/remove detection comes from incremental reconciliation.

## 3. What was changed

- **NEW `lib/metaSyncState.js`** — SHA-256 fingerprint + field diff over
  `{name, accountStatus, currency, balance, spendCap, amountSpent,
  disableReason}`; `metaSyncState` collection (last reconcile, usage %,
  `backoffUntil`); `x-app-usage` parsing with pre-emptive backoff at
  ≥75%; exponential-backoff helper; rate-limit error detector;
  `webhookEvents` idempotency store.
- **`lib/metaApiService.js`** — records rate usage on every Graph call;
  backs off before calling when `backoffUntil` is active;
  **NEW `fetchSingleAdAccountFromMeta(id)`** (one account, required fields
  only, 3 retries, no retry on rate-limit); **NEW `checkManualThrottle()`**
  server-side refresh guard. All existing exports/response shapes kept.
- **`lib/autoMetaFetch.js`** (rewritten core, same exports) —
  `applyIncrementalDiff()` bulk-writes **only changed docs**, deletes
  removed ones, propagates **name/currency/status/spendCap/spent into
  `adAccounts`** (the rename fix), materializes new accounts
  non-destructively, and emits granular `ad_account.created / .updated /
  .deleted` SSE payloads (`{event, adAccountId, changes, account,
  syncedAt}`). Adaptive schedule: base full reconcile **5 min** (was
  ~30–50s), 2.5 min after active passes, backoff on failure/rate-limit.
  **NEW `requestPrioritySync(ids)`** coalesced targeted queue (≤5/batch,
  15s gap) for webhook/manual single-account refresh.
- **NEW `app/api/meta/webhook/route.js`** — GET challenge verification
  (`META_WEBHOOK_VERIFY_TOKEN`), POST `X-Hub-Signature-256` HMAC check
  (`META_APP_SECRET` or `metaSettings.appSecret`), instant HTTP 200,
  background processing, 24h dedupe, targeted refresh per account id,
  bounded reconcile fallback when no id is parseable.
- **`app/api/events/route.js`** — now honors `?channel=` subscriptions and
  auto-subscribes every client to `admin:meta` (previously nobody received
  channel events).
- **`app/api/admin/meta-api/sync/route.js`** — `fetch-accounts` now runs the
  single shared incremental reconcile (same response fields plus
  `updated`/`deleted`); **NEW `refresh-account`** targeted action; 60s
  server-side throttle (429) on manual actions; `sync-spend` throttled.
  Old `success/accounts/count/created` fields preserved.
- **`app/api/admin/meta-api/route.js`** — stores `appSecret` (never
  returned; only `hasAppSecret` flag). Empty token/secret inputs no longer
  overwrite stored values.
- **`lib/indexes.js`** — added `webhookEvents.expiresAt` (TTL),
  `metaSyncState`, `metaAdAccounts.importedAt` indexes.
- **NEW `app/Component/Hooks/useAdAccountRealtime.js`** — applies granular
  events via `setQueryData` row patches (rename updates `name` +
  `metaAccountName` in place); create prepends, delete removes;
  pagination/search/filter/sort/selection untouched. Generic legacy events
  still invalidate as before.
- **`app/Component/Hooks/useSSE.js`** — listens to granular event names,
  reconnects with backoff after network loss, fixed ref-during-render
  lint error. No API change.
- **Pages** — `admin/ad-accounts`, `admin/ad-accounts-topup`, user
  `ad-account` use the realtime hook (no full refetch on events, no UI
  redesign, all columns/filters/pagination preserved). Removed 30s
  full-list `refetchInterval` on topup + user ad-account pages (SSE-driven
  now); `meta-api` settings page fallback poll relaxed 30s → 5 min.
  `admin/ad-accounts` keeps its 5-min client Sync guard; server adds 60s
  throttle. Settings form gained one App Secret field (webhook signing).

## 4. Preserved behavior

All API response fields, `adAccounts`/`metaAdAccounts` document shapes,
displayed columns, filters, search, pagination, sorting, top-up/import/
assign flows, and token-never-exposed guarantees are unchanged. No MongoDB
data was deleted or migrated; new collections (`metaSyncState`,
`webhookEvents`) are additive.

## 5. Test checklist (per requirements §20)

1. Existing accounts still visible — full reconcile keeps unchanged docs.
2. Rename in BM → `ad_account.updated` with `changes.name`, row updates live.
3. New BM account → `ad_account.created`, prepended without reload.
4. Removed BM account → `ad_account.deleted`, row removed.
5. Other metadata (status/currency/cap) → same updated path.
6. Multiple tabs share one backend sync (locks + shared MongoDB state).
7. No duplicate Meta calls (locks, throttle, coalesced queue).
8. Meta failure → last good data kept, error logged, backoff retry.
9. Rate limit → `backoffUntil` set, syncs skip with log, no retry storm.
10. SSE reconnect with backoff on network loss.
11. Tokens stay server-side (`hasAccessToken`/`hasAppSecret` flags only).
12. Pagination/search/filters preserved (row patches only).
13. All displayed fields preserved (fingerprint covers all of them).

See `realtime-sync.md` for architecture, env vars, and webhook setup.
