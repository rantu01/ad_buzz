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

## 6. Deployment build fix (Turbopack panic)

Production build (`npm run build`) failed on the hosting platform with a
Turbopack internal panic: `Failed to write app endpoint /page`, caused by
`globals.css` PostCSS processing — `node process exited before we could
connect to it`. This is an environment limitation (Tailwind/PostCSS worker
subprocess cannot spawn in the build sandbox), unrelated to the sync
changes (no CSS/config/root-page files were touched). Fix: `build` script
changed to `next build --webpack` (supported flag in Next 16.2.7).
Verified locally: webpack build compiles cleanly, all 61 routes including
new `/api/meta/webhook`.

## 7. Follow-up hardening (2026-10-12)

Three gaps found against the production-safe requirements and fixed with the
smallest safe set (no UI redesign, no response-field renames, no data
migration; all additive):

1. **SSE account-data scoping.** `emitToAll` broadcast every
   `ad_account.*` payload (names, caps, spend) to *every* connected browser,
   including customers who own none of those accounts. Fix:
   **NEW `lib/metaEvents.js`** — `emitMetaAccountEvent(s)` delivers to the
   `admin:meta` channel (staff) plus `emitToUser(uid)` for the assigned
   owner only (one indexed `adAccounts` lookup per emit batch; fail closed
   for customer delivery). `app/api/events/route.js` now auto-subscribes
   **staff uids only** to `admin:meta` (role lookup on `users`, one query
   per long-lived connection; explicit `?channel=` still honored; DB-error
   fail-open preserves admin UI). Status-only events (`meta-status`) remain
   broadcast — they carry no account data. No page changes needed: user
   pages already listen on their shared connection and apply row patches.
2. **Failure-timestamp fix.** `syncAllAdAccounts` set `lastSyncedAt: now`
   even on per-account *failure*, so stale data rendered as freshly synced.
   Fix: error path now writes `syncStatus: "error"` + `syncError` +
   **NEW `lastAttemptedSyncAt`** and leaves `lastSyncedAt` untouched;
   success path writes both. `lastSyncedAt` therefore means last
   *successful* sync everywhere the UI renders "Last Refreshed".
3. **Health endpoint.** `GET /api/admin/meta-api/sync?type=status` returns
   auto-fetch state, last reconcile/sync timestamps, usage %, `backoffUntil`,
   and SSE connection/subscriber counts. Metadata only — no tokens or
   account data. (Back-compat: existing `meta-accounts`/`logs` types and all
   POST actions unchanged.)
4. **Testability extraction (no behavior change).** Pure logic moved to
   dependency-free modules with re-exports preserving every existing import
   contract: `lib/syncMath.js` (fingerprint/diff/usage/backoff/rate-error),
   `lib/prepaid.js` (`parsePrepaidBalance`), `lib/accountMath.js`
   (`computeRemainingBalance`, now used by both admin + user list routes),
   `lib/webhookAuth.js` (HMAC verify + challenge check, now used by the
   webhook route). **NEW `tests/`** — 27 `node --test` unit tests, `npm test`
   script. No new dependencies.
5. **Docs.** NEW `api-status.md` (endpoint/field/freshness contract +
   verification log), NEW `todo.md` (ordered follow-ups).

Verified 2026-10-12: `npm test` 27/27 pass; `npx eslint` clean on all
touched files; `npm run build` compiles, 72 routes. Live BM rename/webhook
propagation still needs staging verification (checklist in
`realtime-sync.md` → Testing, results in `api-status.md`).

## 8. Stuck-page root cause: SSE connection starvation (2026-10-12)

Symptom: page intermittently "completely stuck", sidebar `<Link>` clicks do
nothing. Audit (all providers, layouts, pages, hooks) found no render loop,
no per-render `QueryClient`, no uncleared interval, no navigation blocker —
but confirmed every admin tab held **3 permanent `EventSource` streams**
(`admin:tickets`, `admin:deposits`, default channel pool in `useSSE.js`).
Browsers cap persistent connections per origin (6 on HTTP/1.1), so two tabs
— or one tab plus a long-held Meta request (Sync Spend has per-account
insights calls with 60 s retries; Fetch-from-BM awaits a full reconcile) —
exhausts the pool and every later `fetch()` queues forever, including the
RSC payload fetch behind client-side navigation. Main thread is idle; the
app just never hears back. Matches "sometimes" (depends on tab count and
in-flight long requests).

Fix: `app/Component/Hooks/useSSE.js` rewritten to multiplex all subscribers
onto **one `EventSource` per uid per tab** carrying the union of requested
channels (single reconnect with backoff, listener-error isolation, grow-only
union so reconnects never drop subscriptions). No consumer changes: every
provider already filters by event type, and the server already accepts
multiple `?channel=` params. Verified: `eslint` clean, `npm test` 27/27,
`npm run build` 72 routes OK.

## 9. Stale Remaining Balance: scheduler could die + fetch could hang
forever (2026-10-12)

Reported symptom: Remaining Balance USD $99.94, "Last Refreshed: 21h 48m
ago" — far beyond the 5-min base reconcile interval, meaning the worker
had effectively stopped refreshing in the running process.

Two code-level defects found by tracing the full flow
(Meta Graph → reconciler → MongoDB → `/api/user/ad-accounts` +
`/api/admin/ad-accounts` join → SSE → row patch):

1. **Scheduler chain dies on a single escaped rejection.**
   `startAutoMetaFetch` (`lib/autoMetaFetch.js`) chained
   `await runFullReconcile(); schedule();` — anything that threw
   outside the inner try (e.g. `getBackoffRemainingMs`/Mongo read in
   the backoff check, `acquireSyncLock`, `releaseSyncLock` in `finally`)
   rejected the `setTimeout` callback, so `schedule()` never ran again.
   The worker silently stopped for the life of the process: exactly the
   observed "frozen for 21h" timestamp with no error in the UI.
   Fix: all work lives inside one try/catch/finally (lock released only
   if acquired), and the loop is driven by `runWithReschedule(pass,
   schedule)` from `lib/syncMath.js`, which **always** reschedules in a
   `finally`. A scheduled pass that somehow throws is caught, counted in
   `consecutiveFailures` (→ backoff), logged, and returned as
   `{skipped, reason:"error"}`.
2. **No timeout on any Meta fetch.** `fetchPaginated`,
   `fetchSingleAdAccountFromMeta`, `fetchAdAccountInsights`,
   `updateSpendCap`, `testConnection` used bare `fetch()` with no
   `AbortSignal`. One hung TCP socket wedges the reconcile pass forever
   (the next pass only starts after the current one completes), freezing
   freshness with zero errors. Fix: **NEW `lib/httpUtil.js`** —
   `fetchWithTimeout` (default 30s, `META_FETCH_TIMEOUT_MS` env override,
   clamped ≤300s, aborts with a descriptive error, propagates caller
   aborts); all five Meta call sites now use it. Timeouts surface as
   normal transient errors → existing retry/backoff handles them.

Freshness contract (unchanged, now actually guaranteed): a successful
reconcile updates `metaSyncState.lastSyncedAt` + per-account
`adAccounts.lastSyncedAt`/`metaAdAccounts.importedAt` even when values
are unchanged; failures never advance `lastSyncedAt`. Remaining Balance
stays `spend_cap − amount_spent` (`lib/accountMath.js`), unchanged.

Verified: `npm test` 33/33 (new: hung-request abort test, timeout
config test, `runWithReschedule` reschedule-on-throw test); `eslint`
clean; `npm run build` 72 routes OK. **Not verified here: live Meta
API responses and the production DB** (no network/credential access in
this environment) — see the report for the required staging checks.
