# TODO — Meta Sync Follow-ups

## Done (2026-10-12)

- [x] Scoped SSE account delivery (`lib/metaEvents.js`): staff channel +
  assigned-owner targeting; role-aware `admin:meta` auto-subscribe.
- [x] Failure-timestamp fix: `syncAllAdAccounts` errors no longer advance
  `lastSyncedAt`; `lastAttemptedSyncAt` recorded on both paths.
- [x] Health endpoint: `GET /api/admin/meta-api/sync?type=status`.
- [x] Pure-logic extraction (`lib/syncMath.js`, `lib/prepaid.js`,
  `lib/accountMath.js`, `lib/webhookAuth.js`) + 27 `node --test` unit tests.
- [x] `api-status.md` created; `progress.md` / `realtime-sync.md` updated.

## Remaining (ordered by value)

0. **Confirm the stuck-page fix in production** — open two admin tabs, start
   a Sync Spend, and navigate via the sidebar in both tabs. DevTools →
   Network should show exactly 1 `api/events` stream per tab (was 3).
   If a freeze recurs, capture: tab count, pending requests in Network,
   and whether the stream count exceeds 1/tab.
1. **Confirm the stale-balance fix in production** — after deploy:
   (a) `GET /api/admin/meta-api/sync?type=status` → `autoFetch.state`
   must be `synced` with a recent `lastRunAt` (was frozen at the
   reported incident); (b) watch `syncLogs` for `[Auto-fetch]
   Reconcile error` every ~5 min — recurring errors mean the token
   or network needs attention, not code; (c) compare one account's
   `spend_cap`/`amount_spent` from the Meta Graph API response to
   `metaAdAccounts` (the join source for the displayed Remaining
   Balance) to confirm fresh values land.

1. **Live end-to-end verification on staging** — rename/add/remove an account
   in the BM and confirm row-level SSE updates (checklist in
   `realtime-sync.md` → Testing). Needs a staging BM + webhook subscription;
   cannot be done from code alone.
2. **Verify SSE role mapping against real staff uids** — confirm every staff
   `users.role` value is non-`customer` so admin dashboards keep receiving
   `admin:meta` after the auto-subscribe change. Spot-check
   `/api/admin/meta-api/sync?type=status` (`adminMetaSubscribers`) after deploy.
3. **Consider Firebase ID-token verification on `/api/events`** — currently the
   `uid` query param is trusted (pre-existing convention across all API
   routes). Verifying the token per SSE connect would close deliberate
   `?channel=admin:meta` snooping by non-staff. Bigger change; do together
   with route-wide auth hardening, not alone.
4. **Multi-process SSE** — `sseManager` is in-process memory. If Hostinger ever
   runs ≥2 Node processes, add a shared pub/sub before scaling out (status
   endpoint exposes connection counts to detect this).
5. **Meta webhook production subscription** — callback URL, verify token,
   `effective_status` field, and `subscribed_apps` per ad account (steps in
   `realtime-sync.md`). Until then, rename detection latency = reconcile
   interval (by design, documented in UI timestamps).
6. **Optional:** extend tests to DB-backed paths (incremental diff
   persistence, priority-queue coalescing) with a test MongoDB instance.
   Pure-logic coverage exists; integration coverage does not.
