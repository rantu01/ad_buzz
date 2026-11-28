# Progress — Near-Real-Time Meta Ad Account Sync

## Admin profile upload + reverse infinite scroll chat (2026-11-27)

### Part 1 — Admin profile image upload
- `app/(admin)/admin/profile/page.jsx`: added the user dashboard's exact upload
  flow — hidden `<input type="file">`, PNG/JPG/WEBP/GIF type check, 2 MB size
  check, `FileReader.readAsDataURL`, `PATCH /api/user/profile` with the base64
  `avatar` field, Remove (sends `null`), the `adbuzz:avatar-updated` sync event,
  and query invalidation/refetch. The existing initial-letter fallback and card
  layout are preserved; the image now reads `users.avatar` (with legacy
  `photoURL` fallback) instead of Firebase `photoURL` alone.
- `app/(admin)/admin/components/Topbar.jsx`: the admin identity chip now renders
  the uploaded picture when present (initials fallback unchanged) and listens
  for `adbuzz:avatar-updated`; state is keyed by uid so stale avatars cannot
  leak across sign-ins. The fetch listener is cleaned up on unmount.
- No new API, storage field, schema change, or User Dashboard modification.

### Part 2 — Chat system optimization
Audit again confirmed exactly three real-time chat surfaces (customer chat,
admin support chat, staff internal chat; the floating widget embeds the first).
Support-ticket reply lists remain ticket views, unchanged.

- **NEW `lib/chatPagination.js`** — `CHAT_PAGE_SIZE = 25`, `messageKey`,
  `dedupeMessages`, `mergeOlderMessages`, `upsertMessage`, `normalizePage`.
- **NEW `app/Component/Hooks/useChatPagination.js`** — cursor/state machine for
  newest-page-first loading and one-page-at-a-time older loading, with an
  in-flight guard, per-conversation reset, cache restore, and `hasOlder` from
  the server. No polling or repeated requests.
- **`app/Component/Hooks/useChatScroll.js`** — extended with reverse infinite
  scroll: requests the next older page when the reader reaches within 120 px of
  the top, with an anchor guard so duplicate scroll events do not fan out into
  duplicate fetches. Existing bottom-follow, prepend-anchoring and Scroll to
  Latest behaviour retained.
- **NEW `app/Component/Chat/ChatHistoryStatus.jsx`** — shared loading indicator
  and "Beginning of conversation" end marker on all three pages.
- **API (backward compatible):** `getMessagesPage()` (`lib/chatModel.js`) and
  `getInternalMessagesPage()` (`lib/internalChatModel.js`) fetch `limit + 1`
  to derive `hasMore` without a count query; `getMessages` /
  `getInternalMessages` still return plain arrays. The three history GET routes
  now return additive `hasMore` + `nextCursor`; all existing fields unchanged.
  Customer chat's `before` now accepts the same ISO cursor as internal chat
  (messageId still supported). No new indexes needed — existing
  `{conversationId, createdAt}` indexes serve the queries.
- **Pages:** initial history calls now use `limit=25`; older pages are prepended
  with dedupe and in-flight guards; per-conversation caches keep the cursor and
  `hasOlder` flag; SSE echoes/reconnects merge instead of replacing loaded older
  pages; manual "Load earlier messages" button retained in internal chat; sent
  messages still pin to the bottom.
- **NEW `tests/chatPagination.test.js`** (8 tests) added to `npm test`.

### Verification
- `npm test`: 53/53 pass. `npm run build`: passes (115 routes). ESLint on all
  touched files: 0 errors (the two pre-existing `admin/chat` warnings remain).
- **Real-browser test** (headless Chrome + CDP) with a temporary harness using
  the real hooks: opened at the newest 25 messages with one request; each
  scroll-to-top fetched exactly one older page (25 → 50 → 75 → 100), no
  duplicates, viewport stayed anchored on the previously read message, loading
  stopped at the beginning with the end marker; incoming message while reading
  older messages did not move `scrollTop` and kept the button visible; button
  smoothly returned to the bottom and hid. Harness and CDP scripts removed.
- Read-only API smoke: `GET /api/user/profile` 200,
  `GET /api/user/chat/messages?limit=25` 200 with pagination metadata, invalid
  avatar PATCH correctly rejected with HTTP 400 (no data written).
- **Not verifiable here:** authenticated two-device live send/receive and a real
  image upload round trip (no Firebase credentials); require staging checks.
  `createdAt`-only cursors can skip messages sharing an identical millisecond
  timestamp in very high bursts; existing IDs/timestamps make this unlikely.

## Chat scrolling behaviour — all chat interfaces (2026-11-27)

### Scope
Full-project audit found three real-time chat interfaces; all three now share
one scrolling implementation (the floating dashboard widget embeds the user
chat component, so it inherits the behaviour too):

| Route / surface | File |
|---|---|
| `/admin/chat` | `app/(admin)/admin/chat/page.jsx` |
| `/admin/internal-chat` | `app/(admin)/admin/internal-chat/page.jsx` |
| `/user-dashboard/chat` + floating widget | `app/Component/Chat/UserChatInterface.jsx` |

Support-ticket reply threads (`/admin/support-tickets`, `/user-dashboard/support-tickets`)
are ticket-detail views, not chat interfaces; they were reviewed and left
unchanged under the "do not modify unrelated modules" restriction.

### Changes
- **NEW `app/Component/Hooks/useChatScroll.js`** — reusable hook that owns the
  message-container scroll state: instant jump to the newest message on mount /
  reload / history load / conversation switch, `atBottom` tracking from the
  element's real geometry (80 px threshold), follow-on-new-message only when
  already at the bottom, viewport-preserving prepend for older-history
  pagination, `pinToBottom()` for outgoing messages, and smooth
  `scrollToLatest()` for the button. It uses refs for mutable values and a
  layout effect (SSR-safe fallback) so jumps happen before paint, with no
  polling or extra renders per message.
- **NEW `app/Component/Chat/ScrollToLatestButton.jsx`** — modern floating white
  pill with Lucide `ArrowDown`, hidden automatically at the bottom, matching
  the existing orange-accent UI; keyboard focus ring and reduced-motion aware.
- Removed the three ad-hoc `scrollTop = scrollHeight` effects / SSE timeouts
  and internal chat's duplicate `atBottomRef`/`handleScroll`; each page now
  calls `onScroll={handleScroll}`, renders the shared button in a `relative`
  wrapper around the existing scrollable list, and calls `pinToBottom()` when
  sending. Chat markup, styling, messages, composer, calls, pagination,
  search, attachments, SSE, APIs, DB and auth are unchanged.

### Verification
- `npm test`: 45/45 pass. `npm run build`: passes (115 routes, no new route
  left behind). `npx eslint` on all five new/changed files: 0 errors (only the
  two pre-existing `exhaustive-deps` warnings in `admin/chat`).
- **Real-browser test** (headless Chrome + DevTools Protocol) drove a temporary
  harness using the actual hook and button; all scenarios passed:
  initial mount `scrollTop = scrollHeight - clientHeight` (bottom, no button);
  scroll up → button appears; button click → smooth scroll back to bottom and
  button hides; incoming message while scrolled up → `scrollTop` unchanged,
  button stays; incoming message at bottom → follows to new bottom; prepend of
  older messages → `scrollTop` shifts by the added height (position preserved);
  send while scrolled up → jumps to newest; conversation switch → bottom.
  The temporary harness page and Chrome/CDP scripts were removed afterwards.
- All three chat routes return HTTP 200 in dev; unauthenticated visits redirect
  to `/login` (pre-existing auth), so authenticated two-device live-message
  and call flows still require staging credentials/browser verification.

## Fix: Internal Chat image preview (2026-11-26)

- Root cause: `/api/internal-chat/attachments` GET required a Bearer header,
  but `<img src>` / `<a href>` subresource requests cannot send one, so every
  image preview returned 401. Customer chat worked because its URL carries a
  `uid` query param.
- Fix: GET now accepts a `uid` query param (and still accepts Bearer tokens).
  It requires an existing **staff** account and membership of the conversation
  that actually references the attachment; customers and non-member staff get
  403. Bubbles append `uid` to attachment URLs and cap image width.
- Verified with a real 1x1 PNG and real tokens: upload 200, message stored with
  attachment, image GET without Authorization header 200 `image/png` with
  correct byte length, non-member staff 403, customer 403. Probe records removed.

## Fix: "((intermediate value) || []).find is not a function" (2026-11-26)

- Root cause: `GET /api/internal-chat/conversations` returns `unread` as a
  **number**, while the new client-side `normalizeConv()` treated it as the raw
  `[{uid,count}]` array from MongoDB. With unread = 0 the fallback `[]` hid it;
  as soon as another role/user had unread messages (e.g. unread = 2) `.find`
  threw and the list showed only "Retry".
- Fix: `unreadOf()` in the internal chat page now accepts both shapes; server
  helpers (`unreadOf`, `peerOf`, `personOf`) are guarded with `Array.isArray` so
  legacy/malformed documents cannot throw either.
- Verified with real tokens for `technical_manager` (unread = 2) and
  `key_manager`: HTTP 200 and client normalization passes with no exception.

## Chat performance pass (2026-11-26)

### Bottleneck found
Measured with a production-server probe using real Firebase ID tokens and real
user uids. Latencies were quantised in ~250 ms steps: each step is one MongoDB
round trip. Sending a message performed 8 sequential round trips (~2.0 s); a
new conversation waited for ~5 serial client requests before showing a thread.

### Changes
- Backend: single-query token/staff auth, atomic conversation upsert, batched
  user lookups, immutable-membership cache, combined conversation write,
  no count/aggregation on list/unread, ISO cursor pagination, projections,
  `clientId` idempotency for both chat systems, targeted index bootstrap.
- Frontend: optimistic conversation open with "Opening..." skeleton, optimistic
  messages with sending spinner + retry, per-conversation caches, coalesced SSE
  refreshes, instant SSE reconnect (1 s), `onReconnect` resync for unread /
  notifications, `internal:conversation` event for the other participant,
  memoized list items/bubbles, lazy images, near-bottom auto-scroll, "Load
  earlier messages" cursor pagination.
- Notifications: desktop Notification API with single permission prompt on a
  user gesture, hidden-tab-only display, per-id dedupe, no toast for the active
  conversation, missed-call notifications.

### Measured results (median, ms; full samples in `backend_analysis.md`)
| Endpoint | Before | After |
|---|---|---|
| directory | 755.8 | 496.1 |
| conversation list | 757.3 | 495.5 |
| get-or-create | 1008.1 | 740.2 |
| message history | 1008.5 | 496.9 |
| unread | 760.4 | 492.5 |
| call history | 1007.8 | 496.0 |
| send message | 2017.8 | 1239.7 |

Verification: `npm test` 45/45; `npm run build` passes; lint shows no new
errors in changed files; SSE `internal:conversation`, internal + customer
`clientId` idempotency verified end to end with real tokens (probe records
removed; customer conversations preserved).

Not verifiable here: two-device live WebRTC media, browser permission UX on a
real desktop, and mobile rendering — require staging devices.

## Internal chat, calling & branding (2026-11-26)

### Phase 1–2 — analysis and plan (done)
- Full codebase analysis recorded in new `backend_analysis.md`.
- Customer-call root causes confirmed: conversation is born unassigned
  (`chatModel.js`), the customer button was disabled until manual assignment,
  signaling had no staff-channel/offline fallback, `chat:call` notices had no
  UI consumer, and ICE candidates were neither buffered nor correlated to a
  call id.
- `todo.md` / `api_status.md` updated with the plan and endpoint inventory.

### Phase 3 — System B internal Admin/Staff chat (done)
- New collections `internalConversations`, `internalMessages`, `internalCalls`
  with indexes in `lib/indexes.js`. Canonical sorted participant key gives
  race-safe get-or-create; no customer-chat collection is read or written.
- `lib/internalChatModel.js`: membership-scoped queries, per-participant unread
  counters, read receipts, message history pagination, call records/history.
- Verified-token + staff-role authorization on every endpoint via
  `lib/internalChatAuth.js`; SSE emits are targeted with `emitToUser` only.
- New page `/admin/internal-chat` with searchable staff directory, new-chat
  modal, conversation list, WhatsApp-style thread, attachments/voice notes,
  typing indicator, read receipts, call history, skeletons, empty/error
  states, responsive list/thread split, and sidebar entry with unread badge.
- Presence: `sseManager.getOnlineUids/isUidOnline` + staff-only
  `internal:presence` events; explicit `admin:chat|admin:meta` channel
  subscriptions are now staff-only in `app/api/events/route.js`.

### Phase 4 — customer → admin calling fix (done)
- Customer call button no longer depends on manual staff assignment; the
  server resolves the target or broadcasts the offer to the staff channel.
  First accept wins via an `accepted` claim marker.
- Call create/update validates caller membership and receiver role and
  auto-assigns the accepting staff member to previously unassigned chats.
- `CentralCallProvider` now supports both systems and real voice/video:
  `getUserMedia` audio/video tracks, remote/local `<video>`, camera toggle,
  outgoing + incoming ICE buffering, connection failure cleanup, accepted/
  connecting/connected/disconnected states, duration, mute/minimize, and
  cleanup on unmount.

### Phase 5 — branding (done)
- All 10 user-facing `AdsFixer` strings replaced with `Ad Buzz`
  (`UserChatInterface.jsx`, `NewTicketModal.jsx`); root browser title is
  `Ad Buzz Portal`. No DB names, routes, env vars or credentials renamed.

### Verification so far
- `npm test`: 45/45 pass (unchanged baseline).
- `npm run build`: pass, 115 routes including `/admin/internal-chat` and all
  new internal APIs.
- `npm run lint`: no new errors in changed files (remaining errors are
  pre-existing React Compiler rules in unrelated pages; warnings are `<img>`
  and one pre-existing exhaustive-deps warning).
- Data-layer integration smoke test against the live MongoDB using **real**
  admin/staff/customer records: canonical conversation dedupe, peer lookup,
  customer 403 isolation, message persistence, unread + read receipts, call
  create/accept/end and history — PASS. Only the test records created by the
  smoke test were removed; customer-chat data untouched.
- HTTP smoke test on `next dev` with a real Firebase ID token: unauthenticated
  requests → 401, customer token → 403, staff directory → 200, conversation
  create (twice → same id), message send/history, read/unread, call history and
  offline receiver → `unavailable: true` + missed record — all PASS. All test
  records were removed afterwards.

### Still required (manual staging)
- Two-device/browser WebRTC verification: voice + video, accept/reject/missed,
  mute/camera, ICE on a lossy network, navigation cleanup, and a customer call
  to an unassigned conversation. Cannot be completed from a code-only session
  (needs camera/mic, HTTPS and two authenticated devices).

## Chat and voice calling update

- Added a centralized, app-wide voice call provider using the existing SSE
  transport and WebRTC signaling.
- Incoming calls are visible across dashboard pages, with ringtone,
  accept/reject controls, cancel/missed handling, mute, minimize/restore,
  and call duration.
- Video controls and video UI were removed from customer/admin chat surfaces;
  call signaling is voice-only.
- Chat message and unread events now use the shared SSE connection where
  practical, and incoming chat messages produce real-time toasts and
  notification-sound support.

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

## Help Center / Knowledge Base (implemented)
- User: sidebar item Help Center -> /help-center; homepage with categories, search, article cards; article detail with rich text, About sidebar, current date Last updated (Asia/Dhaka), feedback, still need help.
- Admin: /admin/help-center (articles CRUD, publish/unpublish, delete), categories, feedback stats.
- DB: helpCenterCategories, helpCenterArticles, helpCenterFeedback collections + indexes.
- APIs: /api/help-center/* and /api/admin/help-center/*.
- Verified: npm run build, npm test 33/33, npm run lint (warnings only), dev server categories seed.

## User Support Tickets Redesign (implemented)
- Redesigned /user-dashboard/support-tickets with 4 stat cards (Opened, Waiting for you, In progress, Solved), 5-column table, empty state with + Open ticket, modal ticket creation, ticket detail/replies preserved.
- Complete 3-step New Ticket modal: 12 exact subject categories, multi ad-account selection, optional attachments (MongoDB-backed), review/submit, real ad accounts, duplicate prevention.
- Admin support tickets: stats, search/filter, customer/ad-account/attachment details, download authorized attachments.
- Extended ticket records: category, adAccounts[], attachments[], customerName, lastActivityAt. Preserved existing tickets/replies/SSE sync/notifications.
- Build verified (npm run build).